import {
  Body,
  Controller,
  Post,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  MembershipPlan,
  MembershipDaySchedule,
} from "./entities/membership-plan.entity";
import {
  CreateMembershipPlanDto,
  MembershipDayScheduleDto,
} from "./dto/create-membership-plan.dto";
import { UserAccount } from "../auth/entities/user.entity";
import { Field } from "../fields/entities/field.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { Booking } from "./entities/booking.entity";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
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

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      throw new Error("Invalid time format");
    }

    return hours * 60 + minutes;
  }

  /**
   * Validates time window: endTime must be greater than startTime
   */
  private validateTimeWindow(startTime: string, endTime: string): void {
    const start = this.parseTimeToMinutes(startTime);
    const end = this.parseTimeToMinutes(endTime);

    if (end <= start) {
      throw new BadRequestException(
        `Invalid time window: end time (${endTime}) must be greater than start time (${startTime})`,
      );
    }
  }

  /**
   * Checks if two time ranges overlap
   */
  private timeRangesOverlap(
    start1: number,
    end1: number,
    start2: number,
    end2: number,
  ): boolean {
    return (start1 < end2 && end1 > start2) || (start2 < end1 && end2 > start1);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createMembershipPlan(
    @Body() dto: CreateMembershipPlanDto,
    @CurrentAccount() currentUser: AuthenticatedAccount,
  ) {
    // Verify field ownership before proceeding
    const field = await this.fieldRepo.findOne({
      where: { id: dto.fieldId, ownerId: currentUser.id },
    });

    if (!field) {
      throw new NotFoundException(
        `Field with id ${dto.fieldId} not found or access denied`,
      );
    }

    // Validate all day/time windows
    for (const daySchedule of dto.daysOfWeek) {
      this.validateTimeWindow(daySchedule.startTime, daySchedule.endTime);
      // validate startDate and monthlyPrice presence will be enforced by DTO
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
    return await this.membershipPlanRepo.manager.transaction(
      async (manager) => {
        // Acquire pessimistic lock on existing membership plans for this field
        const existingPlans = await manager
          .getRepository(MembershipPlan)
          .createQueryBuilder("plan")
          .innerJoinAndSelect("plan.field", "field")
          .where("plan.field.id = :fieldId", { fieldId: dto.fieldId })
          .andWhere("plan.active = :active", { active: true })
          .setLock("pessimistic_write")
          .getMany();

        // Check for conflicts with existing plans
        for (const existingPlan of existingPlans) {
          const existingDays =
            existingPlan.daysOfWeek as MembershipDaySchedule[];

          // Check each new day schedule against existing schedules
          for (const newDaySchedule of dto.daysOfWeek) {
            // Find all existing schedules for this day
            const existingForThisDay = existingDays.filter(
              (sch) => sch.day === newDaySchedule.day,
            );

            if (existingForThisDay.length === 0) continue;

            // new schedule time window
            const newStart = this.parseTimeToMinutes(newDaySchedule.startTime);
            const newEnd = this.parseTimeToMinutes(newDaySchedule.endTime);

            for (const existingDaySchedule of existingForThisDay) {
              const existingStart = this.parseTimeToMinutes(
                existingDaySchedule.startTime,
              );
              const existingEnd = this.parseTimeToMinutes(
                existingDaySchedule.endTime,
              );

              if (
                this.timeRangesOverlap(
                  newStart,
                  newEnd,
                  existingStart,
                  existingEnd,
                )
              ) {
                throw new ConflictException(
                  `Membership plan conflicts with existing plan on ${newDaySchedule.day} at ${existingDaySchedule.startTime}-${existingDaySchedule.endTime}. Please choose a different time range.`,
                );
              }
            }
          }
        }

        // Create membership plan with flexible day schedules
        // Transform per-day monthlyPrice to string and compute aggregate values
        const daysWithStrings = dto.daysOfWeek.map((d) => ({
          day: d.day,
          startTime: d.startTime,
          endTime: d.endTime,
          startDate: d.startDate,
          monthlyPrice: d.monthlyPrice.toFixed(2),
        }));

        // Set plan-level startDate to earliest startDate among days
        const earliestStart = daysWithStrings.reduce(
          (acc, cur) => (cur.startDate < acc ? cur.startDate : acc),
          daysWithStrings[0].startDate,
        );
        // Aggregate monthlyPrice as sum of per-day monthly prices
        const aggregatedMonthly = daysWithStrings.reduce(
          (sum, cur) => sum + parseFloat(cur.monthlyPrice),
          0,
        );

        const plan = manager.create(MembershipPlan, {
          user,
          field,
          daysOfWeek: daysWithStrings as unknown as MembershipDaySchedule[],
          startDate: earliestStart,
          active: dto.active ?? true,
          userName: dto.userName,
          phoneNumber: dto.phoneNumber,
          monthlyPrice: aggregatedMonthly.toFixed(2),
        });
        await manager.save(plan);

        let syncedCount = 0;
        if (plan.active) {
          // Sync with existing slots: find all future available slots for this field
          const allSlots = await manager
            .getRepository(FieldSlot)
            .createQueryBuilder("slot")
            .where("slot.field_id = :fieldId", { fieldId: field.id })
            .andWhere("slot.status = :status", { status: "available" })
            .andWhere("slot.slot_date >= :startDate", {
              startDate: earliestStart,
            })
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

            // Find ALL matching day schedules for this slot (same day can have multiple time windows)
            const matchingDaySchedules = dto.daysOfWeek.filter(
              (sch) => sch.day === slotDayName,
            );

            if (matchingDaySchedules.length === 0) {
              // No matching day schedule for this slot
              continue;
            }

            // Check if slot time matches ANY of the day's time windows
            const slotStart = this.parseTimeToMinutes(slot.startTime);
            const slotEnd = this.parseTimeToMinutes(slot.endTime);

            // Find a matching schedule for this slot's time window
            let matchingDaySchedule: MembershipDayScheduleDto | null = null;
            for (const schedule of matchingDaySchedules) {
              const scheduleStart = this.parseTimeToMinutes(schedule.startTime);
              const scheduleEnd = this.parseTimeToMinutes(schedule.endTime);

              if (slotStart === scheduleStart && slotEnd === scheduleEnd) {
                // Also check that the slot date is on or after this schedule's start date
                const slotDateStr = slot.slotDate;
                if (slotDateStr >= schedule.startDate) {
                  matchingDaySchedule = schedule;
                  break;
                }
              }
            }

            if (!matchingDaySchedule) {
              // No matching time window for this slot or slot is before schedule start date
              continue;
            }

            // Lock the slot for update
            const lockedSlot = await manager
              .getRepository(FieldSlot)
              .createQueryBuilder("slot")
              .where("slot.id = :id", { id: slot.id })
              .setLock("pessimistic_write")
              .getOne();

            if (!lockedSlot || lockedSlot.status !== "available") continue;

            // Compute per-day membership slot price
            const membershipSlotPrice = this.computeSlotPrice(
              matchingDaySchedule.monthlyPrice,
            );

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
              totalAmount: "0",
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
          },
          syncedSlots: syncedCount,
        };
      },
    );
  }
}
