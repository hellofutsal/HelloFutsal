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
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { CreateBookingDto } from "./dto/create-booking.dto";

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(FieldSlot)
    private readonly fieldSlotsRepository: Repository<FieldSlot>,
    @InjectRepository(UserAccount)
    private readonly userAccountsRepository: Repository<UserAccount>,
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

          let user = await userRepository.findOne({
            where: { mobileNumber },
          });

          if (!user) {
            user = userRepository.create({
              name: userName,
              mobileNumber,
              passwordHash: null,
            });
            user = await userRepository.save(user);
          } else if (!user.name) {
            user.name = userName;
            user = await userRepository.save(user);
          }

          slot.status = "booked";
          await slotRepository.save(slot);

          return {
            slot: {
              id: slot.id,
              fieldId: slot.fieldId,
              slotDate: slot.slotDate,
              startTime: slot.startTime,
              endTime: slot.endTime,
              status: slot.status,
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
}
