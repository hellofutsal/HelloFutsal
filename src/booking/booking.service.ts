import {
  BadRequestException,
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
import { CancelledBooking } from "./entities/cancelled-booking.entity";
import { MembershipPlan } from "./entities/membership-plan.entity";
import { Field } from "../fields/entities/field.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { ConfirmBookingDto } from "./dto/confirm-booking.dto";
import { MembershipDaySchedule } from "./entities/membership-plan.entity";
import { MembershipPricingHistory } from "./entities/membership-pricing-history.entity";
import { getMembershipTimeWindows } from "./membership-plan-schedule.utils";

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(CancelledBooking)
    private readonly cancelledBookingsRepository: Repository<CancelledBooking>,
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
            slot.price = await this.resolveEffectiveMembershipPrice(
              manager,
              matchingPlan.id,
              slot.slotDate,
              matchingPlan.perSlotPrice,
            );
            slot.slotType = "membership";
            slot.membershipPlanId = matchingPlan.id;
            bookingType = "membership";
          }
          // ---------------------------------------------------------------------------

          const bookingRepo = manager.getRepository(Booking);

          // Ensure there's no active booking for this slot (status <> 'cancelled').
          const activeBooking = await bookingRepo
            .createQueryBuilder("booking")
            .where("booking.slot_id = :slotId", { slotId: slot.id })
            .andWhere("booking.status <> :cancelled", {
              cancelled: "cancelled",
            })
            .setLock("pessimistic_write")
            .getOne();

          if (activeBooking) {
            throw new ConflictException("Slot already has an active booking");
          }

          // Create a new booking row (preserve cancelled history rows separately).
          const booking = await bookingRepo.save(
            bookingRepo.create({
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
      const fieldInventory = this.normalizeFieldInventoryCatalog(
        booking.field.inventory,
      );
      const selectedInventory = this.normalizeInventorySelection(
        confirmBookingDto.inventoryItems,
      );

      booking.baseAmount = this.formatAmount(slot.price);

      if (selectedInventory.length > 0) {
        const pricedInventory = this.buildSelectedInventorySnapshot(
          selectedInventory,
          fieldInventory,
        );
        const inventorySubtotal = pricedInventory.reduce(
          (sum, item) => sum + Number(item.subtotal),
          0,
        );
        const combinedAmount = baseAmount + inventorySubtotal;
        const providedTotal = confirmBookingDto.totalAmount;

        const totalAmount =
          providedTotal === undefined ? combinedAmount : Number(providedTotal);

        if (confirmBookingDto.discount === undefined) {
          if (totalAmount < combinedAmount) {
            booking.discount = true;
            booking.discountAmount = this.formatAmount(
              combinedAmount - totalAmount,
            );
          } else {
            booking.discount = false;
            booking.discountAmount = this.formatAmount(0);
          }
        } else {
          if (confirmBookingDto.discount && totalAmount >= combinedAmount) {
            throw new ConflictException(
              "When discount is enabled, total amount should be less than the combined inventory amount.",
            );
          }

          if (!confirmBookingDto.discount && totalAmount < combinedAmount) {
            throw new ConflictException(
              "Total amount cannot be less than the combined inventory amount. Please toggle on the discount button to apply discount.",
            );
          }

          booking.discount = confirmBookingDto.discount;
          booking.discountAmount = booking.discount
            ? this.formatAmount(combinedAmount - totalAmount)
            : this.formatAmount(0);
        }

        booking.extraAmount = this.formatAmount(inventorySubtotal);
        booking.totalAmount = this.formatAmount(totalAmount);
        booking.selectedInventory = pricedInventory;
      } else {
        const providedTotal = confirmBookingDto.totalAmount;
        const totalAmount =
          providedTotal === undefined ? baseAmount : Number(providedTotal);

        // If discount flag provided explicitly, validate consistency; otherwise infer it.
        if (confirmBookingDto.discount === undefined) {
          if (totalAmount < baseAmount) {
            booking.discount = true;
            booking.discountAmount = this.formatAmount(
              baseAmount - totalAmount,
            );
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
            booking.discountAmount = this.formatAmount(
              baseAmount - totalAmount,
            );
            booking.extraAmount = this.formatAmount(0);
          } else {
            booking.extraAmount = this.formatAmount(totalAmount - baseAmount);
            booking.discountAmount = this.formatAmount(0);
          }
        }

        booking.totalAmount = this.formatAmount(totalAmount);
        booking.selectedInventory = null;
      }

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
          selectedInventory: booking.selectedInventory,
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

  async bulkConfirmBookings(
    account: AuthenticatedAccount,
    bulkConfirmDto: any, // BulkConfirmBookingsDto
  ) {
    this.ensureAdmin(account);

    const items: Array<{
      slotId: string;
      discount?: boolean;
    }> = bulkConfirmDto?.bookings || [];

    if (!Array.isArray(items) || items.length === 0) {
      throw new NotFoundException("No bookings provided");
    }

    const rootTotalRaw = bulkConfirmDto?.totalAmount;
    let splitAmountsByIndex: Array<number | undefined> = [];
    if (rootTotalRaw !== undefined) {
      const count = items.length;
      if (count === 0) {
        throw new NotFoundException("No bookings provided");
      }

      const totalAmountNumber = Number(rootTotalRaw);
      if (!Number.isFinite(totalAmountNumber) || totalAmountNumber <= 0) {
        throw new BadRequestException("totalAmount must be a positive number");
      }

      const totalCents = Math.round(totalAmountNumber * 100);
      const baseCents = Math.floor(totalCents / count);
      const remainder = totalCents - baseCents * count;

      splitAmountsByIndex = Array.from({ length: count }, (_, index) => {
        // Distribute remaining cents to the first N slots.
        const cents = baseCents + (index < remainder ? 1 : 0);
        return Number((cents / 100).toFixed(2));
      });
    }

    return this.fieldSlotsRepository.manager.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const slotRepository = manager.getRepository(FieldSlot);

      const results: any[] = [];
      const failed: any[] = [];

      for (let index = 0; index < items.length; index++) {
        const it = items[index];
        try {
          const slotId = it.slotId;

          const booking = await bookingRepository
            .createQueryBuilder("booking")
            .innerJoinAndSelect("booking.slot", "slot")
            .innerJoinAndSelect("booking.field", "field")
            .where("booking.slot_id = :slotId", { slotId })
            .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
            .setLock("pessimistic_write")
            .getOne();

          if (!booking) {
            throw new NotFoundException(`Booking not found for slot ${slotId}`);
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
            .where("slot.id = :slotId", { slotId: booking.slotId })
            .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
            .setLock("pessimistic_write")
            .getOne();

          if (!slot) {
            throw new NotFoundException(`Slot not found for slot ${slotId}`);
          }

          const baseAmount = Number(slot.price);
          const providedTotal =
            splitAmountsByIndex.length > 0
              ? splitAmountsByIndex[index]
              : undefined;
          const totalAmount =
            providedTotal === undefined ? baseAmount : Number(providedTotal);

          if (it.discount === undefined) {
            if (totalAmount < baseAmount) {
              booking.discount = true;
              booking.discountAmount = this.formatAmount(
                baseAmount - totalAmount,
              );
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
            if (it.discount && totalAmount >= baseAmount) {
              throw new ConflictException(
                "When discount is enabled, total amount should be less than base amount.",
              );
            }

            if (!it.discount && totalAmount < baseAmount) {
              throw new ConflictException(
                "Total amount cannot be less than base amount. Please toggle on the discount flag to apply discount.",
              );
            }

            booking.discount = it.discount;
            if (booking.discount) {
              booking.discountAmount = this.formatAmount(
                baseAmount - totalAmount,
              );
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

          results.push({
            slotId: slot.id,
            bookingId: booking.id,
            status: booking.status,
          });
        } catch (error) {
          failed.push({
            item: it,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        summary: {
          total: items.length,
          confirmed: results.length,
          failed: failed.length,
        },
        confirmed: results,
        failed,
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

      // Archive cancelled booking into `cancelled_bookings` and remove original
      const cancelledRepo = manager.getRepository(CancelledBooking);

      await cancelledRepo.save(
        cancelledRepo.create({
          originalBookingId: booking.id,
          fieldId: booking.fieldId,
          slotId: booking.slotId,
          userId: booking.userId,
          bookingType: booking.bookingType,
          baseAmount: booking.baseAmount,
          totalAmount: booking.totalAmount,
          discount: booking.discount,
          extraAmount: booking.extraAmount,
          discountAmount: booking.discountAmount,
          selectedInventory: booking.selectedInventory,
          createdAt: booking.createdAt,
          cancelledBy: account.id,
        }),
      );

      await bookingRepository.delete({ id: booking.id });

      slot.status = "available";
      slot.slotType = "normal";
      slot.membershipPlanId = null;
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
          selectedInventory: booking.selectedInventory,
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
        selectedInventory: booking.selectedInventory,
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
        selectedInventory: booking.selectedInventory,
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

  async bulkBookSlots(
    account: AuthenticatedAccount,
    bulkBookDto: any, // BulkBookSlotsDto
  ) {
    this.ensureAdmin(account);

    const {
      fieldId,
      startDate,
      endDate,
      startTime,
      endTime,
      userName,
      phoneNumber,
    } = bulkBookDto;

    const mobileNumber = phoneNumber.trim();
    const name = userName.trim();

    const startDateObj = new Date(`${startDate}T00:00:00Z`);
    const endDateObj = new Date(`${endDate}T00:00:00Z`);
    if (
      Number.isNaN(startDateObj.getTime()) ||
      Number.isNaN(endDateObj.getTime())
    ) {
      throw new BadRequestException(
        "startDate and endDate must be valid dates",
      );
    }
    if (endDateObj < startDateObj) {
      throw new BadRequestException("endDate must be on or after startDate");
    }

    const dayDiff = Math.floor(
      (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (dayDiff > 31) {
      throw new BadRequestException("Date range cannot exceed 31 days");
    }

    if ((startTime && !endTime) || (!startTime && endTime)) {
      throw new BadRequestException(
        "startTime and endTime must be provided together",
      );
    }

    try {
      return await this.fieldSlotsRepository.manager.transaction(
        async (manager) => {
          const slotRepository = manager.getRepository(FieldSlot);
          const userRepository = manager.getRepository(UserAccount);
          const bookingRepository = manager.getRepository(Booking);
          const membershipPlanRepository =
            manager.getRepository(MembershipPlan);
          const fieldRepository = manager.getRepository(Field);

          // Verify field ownership
          const field = await fieldRepository
            .createQueryBuilder("field")
            .where("field.id = :fieldId", { fieldId })
            .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
            .setLock("pessimistic_write")
            .getOne();

          if (!field) {
            throw new NotFoundException("Field not found");
          }

          // Find or create user
          let user = await userRepository
            .createQueryBuilder("user")
            .where("user.mobile_number = :mobileNumber", { mobileNumber })
            .setLock("pessimistic_write")
            .getOne();

          if (!user) {
            try {
              user = userRepository.create({
                name,
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
            user.name = name;
            user = await userRepository.save(user);
          }

          // Find all available slots in the date (and optional time) range
          let slotQuery = slotRepository
            .createQueryBuilder("slot")
            .innerJoinAndSelect("slot.field", "field")
            .where("slot.field_id = :fieldId", { fieldId })
            .andWhere("slot.slot_date >= :startDate", { startDate })
            .andWhere("slot.slot_date <= :endDate", { endDate })
            .andWhere("slot.status = :available", { available: "available" });

          // If startTime and endTime are provided, treat them as a range
          if (startTime && endTime) {
            slotQuery = slotQuery
              .andWhere("slot.start_time >= :startTime", { startTime })
              .andWhere("slot.end_time <= :endTime", { endTime });
          }

          const availableSlots = await slotQuery.getMany();

          const candidatePlans = await membershipPlanRepository
            .createQueryBuilder("plan")
            .where("plan.field_id = :fieldId", { fieldId })
            .andWhere("plan.user_id = :userId", { userId: user.id })
            .andWhere("plan.active = true")
            .getMany();

          const bookedSlots: any[] = [];
          const failedBookings: any[] = [];

          // Book each available slot
          for (const slot of availableSlots) {
            try {
              const lockedSlot = await slotRepository
                .createQueryBuilder("slot")
                .where("slot.id = :slotId", { slotId: slot.id })
                .andWhere("slot.status = :available", {
                  available: "available",
                })
                .setLock("pessimistic_write")
                .getOne();

              if (!lockedSlot) {
                failedBookings.push({
                  slotDate: slot.slotDate,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                  error: "Slot is no longer available",
                });
                continue;
              }

              // Check if membership plan applies
              let bookingType: "normal" | "membership" = "normal";
              const slotDayName = this.getDayName(lockedSlot.slotDate);

              const matchingPlan = candidatePlans.find(
                (p) =>
                  p.startDate <= lockedSlot.slotDate &&
                  (p.daysOfWeek as MembershipDaySchedule[]).some(
                    (schedule) =>
                      schedule.day === slotDayName &&
                      getMembershipTimeWindows(schedule).some(
                        (window) =>
                          window.startTime === lockedSlot.startTime &&
                          window.endTime === lockedSlot.endTime,
                      ),
                  ),
              );

              if (matchingPlan) {
                lockedSlot.price = await this.resolveEffectiveMembershipPrice(
                  manager,
                  matchingPlan.id,
                  lockedSlot.slotDate,
                  matchingPlan.perSlotPrice,
                );
                lockedSlot.slotType = "membership";
                lockedSlot.membershipPlanId = matchingPlan.id;
                bookingType = "membership";
              }

              // Ensure there's no active booking for this slot (status <> 'cancelled').
              const activeBooking = await bookingRepository
                .createQueryBuilder("booking")
                .where("booking.slot_id = :slotId", { slotId: lockedSlot.id })
                .andWhere("booking.status <> :cancelled", {
                  cancelled: "cancelled",
                })
                .setLock("pessimistic_write")
                .getOne();

              if (activeBooking) {
                failedBookings.push({
                  slotDate: slot.slotDate,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                  error: "Slot already booked",
                });
                continue;
              }

              // Create a new booking row (preserve cancelled history rows separately).
              const booking = await bookingRepository.save(
                bookingRepository.create({
                  fieldId: slot.fieldId,
                  slotId: lockedSlot.id,
                  userId: user.id,
                  status: "booked",
                  bookingType,
                  totalAmount: this.formatAmount(0),
                }),
              );

              lockedSlot.status = "booked";
              await slotRepository.save(lockedSlot);

              bookedSlots.push({
                booking: {
                  id: booking.id,
                  fieldId: booking.fieldId,
                  slotId: booking.slotId,
                  userId: booking.userId,
                  status: booking.status,
                  bookingType: booking.bookingType,
                  baseAmount: this.formatAmount(lockedSlot.price),
                  totalAmount: this.sumAmounts(
                    lockedSlot.price,
                    booking.totalAmount,
                  ),
                },
                slot: {
                  id: lockedSlot.id,
                  fieldId: lockedSlot.fieldId,
                  slotDate: lockedSlot.slotDate,
                  startTime: lockedSlot.startTime,
                  endTime: lockedSlot.endTime,
                  slotType: lockedSlot.slotType,
                  status: lockedSlot.status,
                  price: this.formatAmount(lockedSlot.price),
                },
              });
            } catch (error) {
              failedBookings.push({
                slotDate: slot.slotDate,
                startTime: slot.startTime,
                endTime: slot.endTime,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }

          return {
            summary: {
              total: availableSlots.length,
              booked: bookedSlots.length,
              failed: failedBookings.length,
            },
            user: {
              id: user.id,
              name: user.name,
              mobileNumber: user.mobileNumber,
            },
            bookedSlots,
            failedBookings,
          };
        },
      );
    } catch (error) {
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async resolveEffectiveMembershipPrice(
    manager: any,
    membershipPlanId: string,
    slotDate: string,
    fallbackPrice: string,
  ): Promise<string> {
    const pricingHistory: MembershipPricingHistory | null = await manager
      .getRepository(MembershipPricingHistory)
      .createQueryBuilder("history")
      .where("history.membership_plan_id = :membershipPlanId", {
        membershipPlanId,
      })
      .andWhere("history.effective_from_date <= :slotDate", { slotDate })
      .orderBy("history.effective_from_date", "DESC")
      .limit(1)
      .getOne();

    return pricingHistory ? pricingHistory.perSlotPrice : fallbackPrice;
  }

  private normalizeFieldInventoryCatalog(
    inventory: Record<string, string> | null | undefined,
  ): Record<string, string> {
    if (!inventory) {
      return {};
    }

    return inventory;
  }

  private normalizeInventorySelection(
    inventoryItems: Record<string, unknown> | undefined,
  ): Array<{ name: string; quantity: number }> {
    if (!inventoryItems) {
      return [];
    }

    if (inventoryItems === null || Array.isArray(inventoryItems)) {
      throw new BadRequestException(
        "inventoryItems must be a key/value object of quantities",
      );
    }

    return Object.entries(inventoryItems).map(([name, quantityValue]) => {
      const trimmedName = name.trim().toLowerCase();
      if (!trimmedName) {
        throw new BadRequestException("inventory item names cannot be empty");
      }

      const quantity = Number(quantityValue);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new BadRequestException(
          `quantity for ${trimmedName} must be a positive whole number`,
        );
      }

      return { name: trimmedName, quantity };
    });
  }

  private buildSelectedInventorySnapshot(
    selectedInventory: Array<{ name: string; quantity: number }>,
    fieldInventory: Record<string, string>,
  ): Array<{
    name: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }> {
    return selectedInventory.map(({ name, quantity }) => {
      const unitPrice = fieldInventory[name];
      if (unitPrice === undefined) {
        throw new ConflictException(
          `Inventory item ${name} is not configured for this field`,
        );
      }

      const unitPriceNumber = Number(unitPrice);
      if (!Number.isFinite(unitPriceNumber)) {
        throw new ConflictException(
          `Inventory item ${name} has an invalid configured price`,
        );
      }

      const subtotal = Number((unitPriceNumber * quantity).toFixed(2));

      return {
        name,
        quantity,
        unitPrice: this.formatAmount(unitPriceNumber),
        subtotal: this.formatAmount(subtotal),
      };
    });
  }

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
