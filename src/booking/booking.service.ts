import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
// ...existing code...
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { GroundOwnerAccount } from "../auth/entities/ground-owner.entity";
import { UserAccount } from "../auth/entities/user.entity";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { Booking } from "./entities/booking.entity";
import { Field } from "../fields/entities/field.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { ConfirmBookingDto } from "./dto/confirm-booking.dto";

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotsRepository: Repository<FieldSlot>,
    @InjectRepository(UserAccount)
    private readonly userAccountsRepository: Repository<UserAccount>,
  ) {}

  async blockSlot(account: AuthenticatedAccount, slotId: string) {
    this.ensureAdmin(account);

    return this.fieldSlotsRepository.manager.transaction(async (manager) => {
      const slotRepository = manager.getRepository(FieldSlot);
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

      // Only allow blocking if slot is available
      if (slot.status !== "available") {
        throw new ConflictException(
          `Slot is not available for blocking (current status: ${slot.status})`,
        );
      }

      slot.status = "blocked";
      await slotRepository.save(slot);

      const result = {
        slot: {
          id: slot.id,
          fieldId: slot.fieldId,
          slotDate: slot.slotDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: slot.status,
          price: this.formatAmount(slot.price),
        },
        message: "Slot blocked successfully",
      };
      return result;
    });
  }

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

          const booking = await manager.getRepository(Booking).save(
            manager.getRepository(Booking).create({
              fieldId: slot.fieldId,
              slotId: slot.id,
              userId: user.id,
              status: "booked",
              extraAmount: this.formatAmount(0),
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
              baseAmount: this.formatAmount(slot.price),
              extraAmount: this.formatAmount(booking.extraAmount),
              totalAmount: this.sumAmounts(slot.price, booking.extraAmount),
            },
            slot: {
              id: slot.id,
              fieldId: slot.fieldId,
              slotDate: slot.slotDate,
              startTime: slot.startTime,
              endTime: slot.endTime,
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

      booking.extraAmount = this.formatAmount(
        confirmBookingDto.extraAmount ?? 0,
      );
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
          baseAmount: this.formatAmount(slot.price),
          extraAmount: this.formatAmount(booking.extraAmount),
          totalAmount: this.sumAmounts(slot.price, booking.extraAmount),
        },
        slot: {
          id: slot.id,
          fieldId: slot.fieldId,
          slotDate: slot.slotDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: slot.status,
          price: this.formatAmount(slot.price),
        },
        message: "Booking confirmed successfully",
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
        baseAmount: this.formatAmount(booking.slot.price),
        extraAmount: this.formatAmount(booking.extraAmount),
        totalAmount: this.sumAmounts(booking.slot.price, booking.extraAmount),
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
        status: booking.slot.status,
        price: this.formatAmount(booking.slot.price),
      },
    }));
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
    extraAmount: string | number | null | undefined,
  ): string {
    const total = this.parseAmount(baseAmount) + this.parseAmount(extraAmount);
    return total.toFixed(2);
  }
}
