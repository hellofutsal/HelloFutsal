import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { GroundOwnerAccount } from "../auth/entities/ground-owner.entity";
import { UserAccount } from "../auth/entities/user.entity";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { Booking } from "./entities/booking.entity";
import { MembershipPlan } from "./entities/membership-plan.entity";
import { Field } from "../fields/entities/field.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { ConfirmBookingDto } from "./dto/confirm-booking.dto";
import { MembershipDaySchedule } from "./entities/membership-plan.entity";
import { getMembershipTimeWindows } from "./membership-plan-schedule.utils";

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotsRepository: Repository<FieldSlot>,
    @InjectRepository(UserAccount)
    private readonly userAccountsRepository: Repository<UserAccount>,
    @InjectRepository(MembershipPlan)
    private readonly membershipPlanRepository: Repository<MembershipPlan>,
  ) {}

  async createBooking(
    account: AuthenticatedAccount,
    createBookingDto: CreateBookingDto,
  ) {
    this.ensureAdmin(account);

    const mobileNumber = createBookingDto.phoneNumber.trim();
    const userName = createBookingDto.userName.trim();

    try {
      return await this.fieldSlotsRepository.manager.transaction(
        async (manager) => {
          const slotRepository = manager.getRepository(FieldSlot);
          const userRepository = manager.getRepository(UserAccount);
          const membershipPlanRepository =
            manager.getRepository(MembershipPlan);

          const slot = await slotRepository
            .createQueryBuilder("slot")
            .innerJoinAndSelect("slot.field", "field")
            .where("slot.id = :slotId", { slotId: createBookingDto.slotId })
            .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
            .setLock("pessimistic_write")
            .getOne();

          if (!slot) {
            throw new NotFoundException("Slot not found");
          }

          if (slot.status !== "available") {
            throw new ConflictException("Selected slot is not available");
          }

          let user = await userRepository
            .createQueryBuilder("user")
            .where("user.mobile_number = :mobileNumber", { mobileNumber })
            .setLock("pessimistic_write")
            .getOne();

          if (!user) {
            try {
              user = userRepository.create({
                name: userName,
                mobileNumber,
                passwordHash: null,
              });
              user = await userRepository.save(user);
            } catch (error) {
              if (this.isUniqueConstraintViolation(error)) {
                throw new ConflictException(
                  "User with this phone number already exists",
                );
              }

              throw error;
            }
          } else if (!user.name) {
            user.name = userName;
            user = await userRepository.save(user);
          }

          // ---------------------------------------------------------------------------
          // Membership pricing: check if an active membership plan covers this slot.
          // Matching criteria:
          //   • same field
          //   • slot's day-of-week is in plan.daysOfWeek
          //   • slot's startTime & endTime match the plan's window exactly
          //
          // If a match is found, override the slot price with the plan's per-slot price
          // and mark both the slot and the booking as "membership" type.
          // ---------------------------------------------------------------------------
          let bookingType: "normal" | "membership" = "normal";

          const slotDayName = this.getDayName(slot.slotDate);

          const matchingPlan = await membershipPlanRepository
            .createQueryBuilder("plan")
            .where("plan.field_id = :fieldId", { fieldId: slot.fieldId })
            .andWhere("plan.user_id = :userId", { userId: user.id })
            .andWhere("plan.start_date <= :slotDate", {
              slotDate: slot.slotDate,
            })
            .andWhere("plan.active = true")
            .getMany()
            .then((plans) =>
              plans.find((p) =>
                (p.daysOfWeek as MembershipDaySchedule[]).some(
                  (schedule) =>
                    schedule.day === slotDayName &&
                    getMembershipTimeWindows(schedule).some(
                      (window) =>
                        window.startTime === slot.startTime &&
                        window.endTime === slot.endTime,
                    ),
                ),
              ),
            );

          if (matchingPlan) {
            slot.price = matchingPlan.perSlotPrice;
            slot.slotType = "membership";
            slot.membershipPlanId = matchingPlan.id;
            bookingType = "membership";
          }
          // ---------------------------------------------------------------------------

          const booking = await manager.getRepository(Booking).save(
            manager.getRepository(Booking).create({
              fieldId: slot.fieldId,
              slotId: slot.id,
              userId: user.id,
              status: "booked",
              bookingType,
              totalAmount: this.formatAmount(0),
            }),
          );

          slot.status = "booked";
          await slotRepository.save(slot);

          return {
            booking: {
              id: booking.id,
              fieldId: booking.fieldId,
              slotId: booking.slotId,
              userId: booking.userId,
              status: booking.status,
              bookingType: booking.bookingType,
              baseAmount: this.formatAmount(slot.price),
              totalAmount: this.sumAmounts(slot.price, booking.totalAmount),
              extraAmount: this.formatAmount(0),
              discountAmount: this.formatAmount(0),
            },
            slot: {
              id: slot.id,
              fieldId: slot.fieldId,
              slotDate: slot.slotDate,
              startTime: slot.startTime,
              endTime: slot.endTime,
              slotType: slot.slotType,
              status: slot.status,
              price: this.formatAmount(slot.price),
            },
            user: {
              id: user.id,
              name: user.name,
              mobileNumber: user.mobileNumber,
              requiresPasswordSetup: !user.passwordHash,
            },
          };
        },
      );
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          "Unable to create booking because of a conflicting record",
        );
      }

      throw error;
    }
  }

  async confirmBooking(
    account: AuthenticatedAccount,
    slotId: string,
    confirmBookingDto: ConfirmBookingDto,
  ) {
    this.ensureAdmin(account);

    return this.fieldSlotsRepository.manager.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const slotRepository = manager.getRepository(FieldSlot);

      const booking = await bookingRepository
        .createQueryBuilder("booking")
        .innerJoinAndSelect("booking.slot", "slot")
        .innerJoinAndSelect("booking.field", "field")
        .where("booking.slot_id = :slotId", { slotId })
        .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
        .setLock("pessimistic_write")
        .getOne();

      if (!booking) {
        throw new NotFoundException("Slot not found");
      }

      if (booking.status === "completed") {
        throw new ConflictException("Booking is already confirmed");
      }

      if (booking.status !== "booked") {
        throw new ConflictException(
          "Only booked slots can be confirmed as completed",
        );
      }

      const slot = await slotRepository
        .createQueryBuilder("slot")
        .innerJoinAndSelect("slot.field", "field")
        .where("slot.id = :slotId", { slotId })
        .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
        .setLock("pessimistic_write")
        .getOne();

      if (!slot) {
        throw new NotFoundException("Slot not found");
      }

      const baseAmount = Number(slot.price);
      const providedTotal = confirmBookingDto.totalAmount;
      const totalAmount =
        providedTotal === undefined ? baseAmount : Number(providedTotal);

      // If discount flag provided explicitly, validate consistency; otherwise infer it.
      if (confirmBookingDto.discount === undefined) {
        if (totalAmount < baseAmount) {
          booking.discount = true;
          booking.discountAmount = this.formatAmount(baseAmount - totalAmount);
          booking.extraAmount = this.formatAmount(0);
        } else if (totalAmount > baseAmount) {
          booking.discount = false;
          booking.extraAmount = this.formatAmount(totalAmount - baseAmount);
          booking.discountAmount = this.formatAmount(0);
        } else {
          booking.discount = false;
          booking.extraAmount = this.formatAmount(0);
          booking.discountAmount = this.formatAmount(0);
        }
      } else {
        // explicit flag: validate
        if (confirmBookingDto.discount && totalAmount >= baseAmount) {
          throw new ConflictException(
            "When discount is enabled, total amount should be less than base amount.",
          );
        }

        if (!confirmBookingDto.discount && totalAmount < baseAmount) {
          throw new ConflictException(
            "Total amount cannot be less than base amount. Please toggle on the discount button to apply discount.",
          );
        }

        booking.discount = confirmBookingDto.discount;
        if (booking.discount) {
          booking.discountAmount = this.formatAmount(baseAmount - totalAmount);
          booking.extraAmount = this.formatAmount(0);
        } else {
          booking.extraAmount = this.formatAmount(totalAmount - baseAmount);
          booking.discountAmount = this.formatAmount(0);
        }
      }

      booking.baseAmount = this.formatAmount(slot.price);
      booking.totalAmount = this.formatAmount(totalAmount);
      booking.status = "completed";
      await bookingRepository.save(booking);

      slot.status = "completed";
      await slotRepository.save(slot);

      return {
        booking: {
          id: booking.id,
          fieldId: booking.fieldId,
          slotId: booking.slotId,
          userId: booking.userId,
          status: booking.status,
          bookingType: booking.bookingType,
          discount: booking.discount,
          baseAmount: booking.baseAmount,
          totalAmount: booking.totalAmount,
          extraAmount: booking.extraAmount,
          discountAmount: booking.discountAmount,
        },
        slot: {
          id: slot.id,
          fieldId: slot.fieldId,
          slotDate: slot.slotDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotType: slot.slotType,
          status: slot.status,
          price: this.formatAmount(slot.price),
        },
        message: "Booking confirmed successfully",
      };
    });
  }

  async cancelBooking(account: AuthenticatedAccount, slotId: string) {
    this.ensureAdmin(account);

    return this.fieldSlotsRepository.manager.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const slotRepository = manager.getRepository(FieldSlot);

      const booking = await bookingRepository
        .createQueryBuilder("booking")
        .innerJoinAndSelect("booking.slot", "slot")
        .innerJoinAndSelect("booking.field", "field")
        .where("booking.slot_id = :slotId", { slotId })
        .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
        .setLock("pessimistic_write")
        .getOne();

      if (!booking) {
        throw new NotFoundException("Booking not found");
      }

      if (booking.status === "completed") {
        throw new ConflictException("Completed bookings cannot be cancelled");
      }

      if (booking.status !== "booked") {
        throw new ConflictException("Only booked bookings can be cancelled");
      }

      const slot = await slotRepository
        .createQueryBuilder("slot")
        .innerJoinAndSelect("slot.field", "field")
        .where("slot.id = :slotId", { slotId: booking.slotId })
        .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
        .setLock("pessimistic_write")
        .getOne();

      if (!slot) {
        throw new NotFoundException("Slot not found");
      }

      booking.status = "cancelled";
      await bookingRepository.save(booking);

      slot.status = "available";
      await slotRepository.save(slot);

      return {
        booking: {
          id: booking.id,
          fieldId: booking.fieldId,
          slotId: booking.slotId,
          userId: booking.userId,
          status: booking.status,
          bookingType: booking.bookingType,
          discount: booking.discount,
          baseAmount: booking.baseAmount,
          totalAmount: booking.totalAmount,
          extraAmount: booking.extraAmount,
          discountAmount: booking.discountAmount,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
        },
        slot: {
          id: slot.id,
          fieldId: slot.fieldId,
          slotDate: slot.slotDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotType: slot.slotType,
          status: slot.status,
          price: this.formatAmount(slot.price),
        },
        message: "Booking cancelled successfully",
      };
    });
  }

  async listBookingsByField(account: AuthenticatedAccount, fieldId: string) {
    this.ensureAdmin(account);

    const field = await this.fieldSlotsRepository.manager
      .getRepository(Field)
      .createQueryBuilder("field")
      .select("field.id", "id")
      .where("field.id = :fieldId", { fieldId })
      .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
      .getRawOne<{ id: string }>();

    if (!field) {
      throw new NotFoundException("Field not found");
    }

    const bookings = await this.bookingsRepository
      .createQueryBuilder("booking")
      .innerJoinAndSelect("booking.user", "user")
      .innerJoinAndSelect("booking.slot", "slot")
      .innerJoinAndSelect("booking.field", "field")
      .where("booking.field_id = :fieldId", { fieldId })
      .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
      .orderBy("slot.slot_date", "ASC")
      .addOrderBy("slot.start_time", "ASC")
      .getMany();

    return bookings.map((booking) => ({
      booking: {
        id: booking.id,
        status: booking.status,
        bookingType: booking.bookingType,
        discount: booking.discount,
        baseAmount: booking.baseAmount,
        totalAmount: booking.totalAmount,
        extraAmount: booking.extraAmount,
        discountAmount: booking.discountAmount,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      },
      customer: {
        id: booking.user.id,
        name: booking.user.name,
        mobileNumber: booking.user.mobileNumber,
        username: booking.user.username,
        email: booking.user.email,
      },
      field: {
        id: booking.fieldId,
      },
      slot: {
        id: booking.slotId,
        slotDate: booking.slot.slotDate,
        startTime: booking.slot.startTime,
        endTime: booking.slot.endTime,
        slotType: booking.slot.slotType,
        status: booking.slot.status,
        price: this.formatAmount(booking.slot.price),
      },
    }));
  }

  async getBookingById(account: AuthenticatedAccount, bookingId: string) {
    this.ensureAdmin(account);

    const booking = await this.bookingsRepository
      .createQueryBuilder("booking")
      .innerJoinAndSelect("booking.user", "user")
      .innerJoinAndSelect("booking.slot", "slot")
      .innerJoinAndSelect("booking.field", "field")
      .where("booking.id = :bookingId", { bookingId })
      .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
      .getOne();

    if (!booking) {
      throw new NotFoundException("Booking not found");
    }

    return {
      booking: {
        id: booking.id,
        fieldId: booking.fieldId,
        slotId: booking.slotId,
        userId: booking.userId,
        status: booking.status,
        bookingType: booking.bookingType,
        discount: booking.discount,
        baseAmount: booking.baseAmount,
        totalAmount: booking.totalAmount,
        extraAmount: booking.extraAmount,
        discountAmount: booking.discountAmount,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      },
      customer: {
        id: booking.user.id,
        name: booking.user.name,
        mobileNumber: booking.user.mobileNumber,
        username: booking.user.username,
        email: booking.user.email,
      },
      field: {
        id: booking.fieldId,
      },
      slot: {
        id: booking.slotId,
        slotDate: booking.slot.slotDate,
        startTime: booking.slot.startTime,
        endTime: booking.slot.endTime,
        slotType: booking.slot.slotType,
        status: booking.slot.status,
        price: this.formatAmount(booking.slot.price),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the lowercase day name (e.g. "monday") for a YYYY-MM-DD date string.
   */
  private getDayName(slotDate: string): string {
    const dayNames = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];

    let dateObj: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
      const [year, month, day] = slotDate.split("-").map(Number);
      dateObj = new Date(year, month - 1, day);
    } else {
      dateObj = new Date(slotDate);
    }

    return dayNames[dateObj.getDay()];
  }

  /**
   * Computes the per-slot price from a monthly membership price.
   * Formula: monthlyPrice / 30  (1 month assumed = 30 days)
   */
  private computeMembershipSlotPrice(
    monthlyPrice: string | number | null | undefined,
  ): string {
    const monthly = this.parseAmount(monthlyPrice);
    return (monthly / 30).toFixed(2);
  }

  private ensureAdmin(account: AuthenticatedAccount): void {
    if (account.role !== "admin") {
      throw new ForbiddenException("Only admins can create bookings");
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error as QueryFailedError & {
      driverError?: { code?: string };
    };

    return driverError.driverError?.code === "23505";
  }

  private parseAmount(value: string | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatAmount(value: string | number | null | undefined): string {
    return this.parseAmount(value).toFixed(2);
  }

  private sumAmounts(
    baseAmount: string | number | null | undefined,
    totalAmount: string | number | null | undefined,
  ): string {
    const total = this.parseAmount(baseAmount) + this.parseAmount(totalAmount);
    return total.toFixed(2);
  }
}
