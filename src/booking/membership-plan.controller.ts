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
  MembershipTimeWindowDto,
} from "./dto/create-membership-plan.dto";
import { UserAccount } from "../auth/entities/user.entity";
import { Field } from "../fields/entities/field.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { Booking } from "./entities/booking.entity";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { getMembershipTimeWindows } from "./membership-plan-schedule.utils";

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

  private validateMembershipScheduleShape(
    membershipSchedules: MembershipDayScheduleDto[],
  ): void {
    const validDays = new Set([
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]);

    for (const [dayIndex, daySchedule] of membershipSchedules.entries()) {
      if (!daySchedule || typeof daySchedule !== "object") {
        throw new BadRequestException(
          `timeRange.${dayIndex} must be an object with day and slots`,
        );
      }

      if (!daySchedule.day || !validDays.has(daySchedule.day)) {
        throw new BadRequestException(
          `timeRange.${dayIndex}.day must be one of sunday, monday, tuesday, wednesday, thursday, friday, saturday`,
        );
      }

      if (!Array.isArray(daySchedule.slots) || daySchedule.slots.length === 0) {
        throw new BadRequestException(
          `timeRange.${dayIndex}.slots must be a non-empty array`,
        );
      }

      for (const [slotIndex, timeWindow] of daySchedule.slots.entries()) {
        if (!timeWindow || typeof timeWindow !== "object") {
          throw new BadRequestException(
            `timeRange.${dayIndex}.slots.${slotIndex} must be an object with startTime and endTime`,
          );
        }

        if (typeof timeWindow.startTime !== "string") {
          throw new BadRequestException(
            `timeRange.${dayIndex}.slots.${slotIndex}.startTime must be a string`,
          );
        }

        if (typeof timeWindow.endTime !== "string") {
          throw new BadRequestException(
            `timeRange.${dayIndex}.slots.${slotIndex}.endTime must be a string`,
          );
        }
      }
    }
  }

  private transformTimeRangeToStorageFormat(
    daySchedules: MembershipDayScheduleDto[],
  ): MembershipDaySchedule[] {
    // Store day schedules as plain day/time windows; plan-level fields carry price/date.
    return daySchedules.map((day) => {
      return {
        day: day.day,
        startTime: day.slots.map((s) => s.startTime),
        endTime: day.slots.map((s) => s.endTime),
      };
    });
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
    const membershipSchedules = dto.timeRange;
    this.validateMembershipScheduleShape(membershipSchedules);

    // Verify field ownership before proceeding
    const field = await this.fieldRepo.findOne({
      where: { id: dto.fieldId, ownerId: currentUser.id },
    });

    if (!field) {
      throw new NotFoundException(
        `Field with id ${dto.fieldId} not found or access denied`,
      );
    }

    // Validate all day/time windows and check for intra-request overlaps
    for (const daySchedule of membershipSchedules) {
      // Validate each time window in the day
      for (const timeWindow of daySchedule.slots) {
        this.validateTimeWindow(timeWindow.startTime, timeWindow.endTime);
      }

      // Check for overlaps between slots within the same day
      const slots = daySchedule.slots || [];
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const slot1 = slots[i];
          const slot2 = slots[j];
          if (
            !(
              slot1.endTime <= slot2.startTime ||
              slot2.endTime <= slot1.startTime
            )
          ) {
            throw new BadRequestException(
              `Overlapping time windows in ${daySchedule.day}: ${slot1.startTime}-${slot1.endTime} overlaps with ${slot2.startTime}-${slot2.endTime}`,
            );
          }
        }
      }
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
          for (const newDaySchedule of membershipSchedules) {
            // Find all existing schedules for this day
            const existingForThisDay = existingDays.filter(
              (sch) => sch.day === newDaySchedule.day,
            );

            if (existingForThisDay.length === 0) continue;

            const newWindows = newDaySchedule.slots;

            for (const existingDaySchedule of existingForThisDay) {
              const existingWindows =
                getMembershipTimeWindows(existingDaySchedule);

              for (const newWindow of newWindows) {
                const newStart = this.parseTimeToMinutes(newWindow.startTime);
                const newEnd = this.parseTimeToMinutes(newWindow.endTime);

                for (const existingWindow of existingWindows) {
                  const existingStart = this.parseTimeToMinutes(
                    existingWindow.startTime,
                  );
                  const existingEnd = this.parseTimeToMinutes(
                    existingWindow.endTime,
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
                      `Membership plan conflicts with existing plan on ${newDaySchedule.day} at ${existingWindow.startTime}-${existingWindow.endTime}. Please choose a different time range.`,
                    );
                  }
                }
              }
            }
          }
        }

        // Transform new nested format into storage format.
        const daysWithStrings =
          this.transformTimeRangeToStorageFormat(membershipSchedules);

        const plan = manager.create(MembershipPlan, {
          user,
          field,
          daysOfWeek: daysWithStrings as unknown as MembershipDaySchedule[],
          startDate: dto.startDate,
          active: dto.active ?? true,
          userName: dto.userName,
          phoneNumber: dto.phoneNumber,
          perSlotPrice: dto.perSlotPrice.toFixed(2),
        });
        const savedPlan = await manager.save(plan);

        let syncedCount = 0;
        if (savedPlan.active) {
          // Sync with existing slots: find all future available slots for this field
          const allSlots = await manager
            .getRepository(FieldSlot)
            .createQueryBuilder("slot")
            .where("slot.field_id = :fieldId", { fieldId: field.id })
            .andWhere("slot.status = :status", { status: "available" })
            .andWhere("slot.slot_date >= :startDate", {
              startDate: dto.startDate,
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
            const matchingDaySchedules = membershipSchedules.filter(
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
            let matchingTimeWindow: MembershipTimeWindowDto | null = null;
            for (const schedule of matchingDaySchedules) {
              const timeWindows = schedule.slots;

              for (const timeWindow of timeWindows) {
                const scheduleStart = this.parseTimeToMinutes(
                  timeWindow.startTime,
                );
                const scheduleEnd = this.parseTimeToMinutes(timeWindow.endTime);

                if (slotStart === scheduleStart && slotEnd === scheduleEnd) {
                  matchingDaySchedule = schedule;
                  matchingTimeWindow = timeWindow;
                  break;
                }
              }

              if (matchingDaySchedule) {
                break;
              }
            }

            if (!matchingDaySchedule || !matchingTimeWindow) {
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

            const membershipSlotPrice = dto.perSlotPrice.toFixed(2);

            // Apply membership pricing and mark as booked
            lockedSlot.status = "booked";
            lockedSlot.slotType = "membership";
            lockedSlot.price = membershipSlotPrice;
            lockedSlot.membershipPlanId = savedPlan.id;
            await manager.save(FieldSlot, lockedSlot);

            // Create booking record with proper relationships
            const booking = manager.create(Booking, {
              fieldId: field.id,
              slotId: lockedSlot.id,
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
            ...savedPlan,
          },
          syncedSlots: syncedCount,
        };
      },
    );
  }
}
