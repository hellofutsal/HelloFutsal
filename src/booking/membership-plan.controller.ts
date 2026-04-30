import { Body, Controller, Post, ConflictException, NotFoundException, ForbiddenException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MembershipPlan } from "./entities/membership-plan.entity";
import { CreateMembershipPlanDto } from "./dto/create-membership-plan.dto";
import { UserAccount } from "../auth/entities/user.entity";
import { Field } from "../fields/entities/field.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { Booking } from "./entities/booking.entity";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";

@Controller("membership-plans")
export class MembershipPlanController {
  constructor(
    @InjectRepository(MembershipPlan)
    private readonly membershipPlanRepo: Repository<MembershipPlan>,
    @InjectRepository(UserAccount)
    private readonly userRepo: Repository<UserAccount>,
    @InjectRepository(Field)
    private readonly fieldRepo: Repository<Field>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotRepo: Repository<FieldSlot>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  /**
   * Computes the per-slot membership price from a monthly price.
   * Formula: monthlyPrice / 30  (1 month = 30 days, 1 day = 1 slot time-block)
   */
  private computeSlotPrice(monthlyPrice: number): string {
    const perSlot = monthlyPrice / 30;
    return perSlot.toFixed(2);
  }

  /**
   * Parses time string to minutes for comparison
   */
  private parseTimeToMinutes(time: string): number {
    const [hoursText, minutesText] = time.trim().split(":");
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error("Invalid time format");
    }

    return hours * 60 + minutes;
  }

  @Post()
  async createMembershipPlan(
    @Body() dto: CreateMembershipPlanDto,
    @CurrentAccount() currentUser: AuthenticatedAccount,
  ) {
    // Verify field ownership before proceeding
    const field = await this.fieldRepo.findOne({
      where: { id: dto.fieldId, ownerId: currentUser.id },
    });

    if (!field) {
      throw new NotFoundException(`Field with id ${dto.fieldId} not found or access denied`);
    }

    // Find or create user by phone number
    let user = await this.userRepo.findOne({
      where: { mobileNumber: dto.phoneNumber },
    });
    if (!user) {
      user = this.userRepo.create({
        name: dto.userName,
        mobileNumber: dto.phoneNumber,
        passwordHash: null,
      });
      user = await this.userRepo.save(user);
    } else if (!user.name) {
      user.name = dto.userName;
      user = await this.userRepo.save(user);
    }

    // Conflict-check, plan save, and slot sync must be run atomically within a transaction
    return await this.membershipPlanRepo.manager.transaction(async (manager) => {
      // Acquire pessimistic lock on existing membership plans for this field
      const existingPlans = await manager
        .getRepository(MembershipPlan)
        .createQueryBuilder("plan")
        .leftJoinAndSelect("plan.field", "field")
        .where("plan.field.id = :fieldId", { fieldId: dto.fieldId })
        .andWhere("plan.active = :active", { active: true })
        .setLock("pessimistic_write")
        .getMany();

      for (const existingPlan of existingPlans) {
        // Check if there are overlapping days
        const overlappingDays = dto.daysOfWeek.filter(day => 
          existingPlan.daysOfWeek.includes(day)
        );

        if (overlappingDays.length > 0) {
          // Check if time ranges overlap
          const newStart = this.parseTimeToMinutes(dto.startTime);
          const newEnd = this.parseTimeToMinutes(dto.endTime);
          
          // Validate time window: endTime must be greater than startTime
          if (newEnd <= newStart) {
            throw new ConflictException("Invalid time window: end time must be greater than start time");
          }
          
          const existingStart = this.parseTimeToMinutes(existingPlan.startTime);
          const existingEnd = this.parseTimeToMinutes(existingPlan.endTime);

          // Check for time overlap
          const timeOverlaps = (
            (newStart < existingEnd && newEnd > existingStart) ||
            (existingStart < newEnd && existingEnd > newStart)
          );

          if (timeOverlaps) {
            throw new ConflictException(
              `Membership plan conflicts with existing plan for ${overlappingDays.join(', ')} at ${existingPlan.startTime}-${existingPlan.endTime}. Please choose a different time range.`
            );
          }
        }
      }

      const plan = manager.create(MembershipPlan, {
        user,
        field,
        daysOfWeek: dto.daysOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        startDate: dto.startDate,
        active: dto.active ?? true,
        userName: dto.userName,
        phoneNumber: dto.phoneNumber,
        monthlyPrice: dto.monthlyPrice.toFixed(2),
      });
      await manager.save(plan);

      // Per-slot price derived from monthly price (monthlyPrice / 30)
      const membershipSlotPrice = this.computeSlotPrice(dto.monthlyPrice);

      let syncedCount = 0;
      if (plan.active) {
        // Sync with existing slots: find all future available slots for this field and exact time window
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const allSlots = await manager
          .getRepository(FieldSlot)
          .createQueryBuilder("slot")
          .where("slot.field_id = :fieldId", { fieldId: field.id })
          .andWhere("slot.start_time = :startTime", { startTime: dto.startTime })
          .andWhere("slot.end_time = :endTime", { endTime: dto.endTime })
          .andWhere("slot.status = :status", { status: "available" })
          .andWhere("slot.slot_date >= :startDate", { startDate: dto.startDate })
          .getMany();

        // Helper: JS getDay() index → day name
        const dayNames = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ];

        for (const slot of allSlots) {
          // Parse slot date as local date (YYYY-MM-DD)
          let slotDateObj: Date;
          if (/^\d{4}-\d{2}-\d{2}$/.test(slot.slotDate)) {
            const [year, month, day] = slot.slotDate.split("-").map(Number);
            slotDateObj = new Date(year, month - 1, day);
          } else {
            slotDateObj = new Date(slot.slotDate);
          }

          const slotDayName = dayNames[slotDateObj.getDay()];
          if (!dto.daysOfWeek.includes(slotDayName)) continue;

          // Lock the slot for update
          const lockedSlot = await manager
            .getRepository(FieldSlot)
            .createQueryBuilder("slot")
            .where("slot.id = :id", { id: slot.id })
            .setLock("pessimistic_write")
            .getOne();

          if (!lockedSlot || lockedSlot.status !== "available") continue;

          // Apply membership pricing and mark as booked
          lockedSlot.status = "booked";
          lockedSlot.slotType = "membership";
          lockedSlot.price = membershipSlotPrice; // override price with membership rate
          await manager.save(FieldSlot, lockedSlot);

          // Create booking record
          const booking = manager.create(Booking, {
            fieldId: field.id,
            slotId: slot.id,
            userId: user!.id,
            status: "booked",
            extraAmount: "0",
            bookingType: "membership",
          });
          await manager.save(Booking, booking);
          syncedCount++;
        }
      }

      return {
        success: true,
        plan: {
          ...plan,
          perSlotPrice: membershipSlotPrice,
        },
        syncedSlots: syncedCount,
      };
    });
  }
}
