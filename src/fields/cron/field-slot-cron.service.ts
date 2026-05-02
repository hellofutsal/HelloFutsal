import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DateTime } from "luxon";
import { Field } from "../entities/field.entity";
import { FieldSlotGenerator } from "./field-slot-generator";
import { FieldSlotSyncService } from "./field-slot-sync.service";
import {
  MembershipDaySchedule,
  MembershipPlan,
} from "../../booking/entities/membership-plan.entity";
import { Booking } from "../../booking/entities/booking.entity";
import { FieldSlot } from "../entities/field-slot.entity";

@Injectable()
export class FieldSlotCronService {
  private readonly logger = new Logger(FieldSlotCronService.name);

  constructor(
    @InjectRepository(Field)
    private readonly fieldsRepository: Repository<Field>,
    private readonly fieldSlotSyncService: FieldSlotSyncService,
    @InjectRepository(MembershipPlan)
    private readonly membershipPlanRepo: Repository<MembershipPlan>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotRepo: Repository<FieldSlot>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  /**
   * Helper method to check if two time ranges overlap
   */
  private timeRangesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean {
    const start1Minutes = this.parseTimeToMinutes(start1);
    const end1Minutes = this.parseTimeToMinutes(end1);
    const start2Minutes = this.parseTimeToMinutes(start2);
    const end2Minutes = this.parseTimeToMinutes(end2);

    return (
      (start1Minutes < end2Minutes && end1Minutes > start2Minutes) ||
      (start2Minutes < end1Minutes && end2Minutes > start1Minutes)
    );
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

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    timeZone: "Asia/Kathmandu",
  })
  // @Cron("*/1 * * * *")
  async generateTomorrowSlotsAndBookMemberships(): Promise<void> {
    // 1. Roll/Create slots as before
    const fields = await this.fieldsRepository.find({
      where: { isActive: true },
      relations: { scheduleSettings: true, ruleBooks: true },
    });

    this.logger.log(
      `Midnight slot cron started. Active fields=${fields.length}`,
    );

    let processedCount = 0;
    let failedCount = 0;

    for (const field of fields) {
      if (!field.scheduleSettings) {
        continue;
      }

      try {
        const retiredDate =
          await this.fieldSlotSyncService.retireOldestActiveSlotDate(field.id);
        const appendedDate = await this.fieldSlotSyncService.appendNextSlotDate(
          field.id,
        );
        processedCount += 1;

        this.logger.log(
          `Rolled slot window for fieldId=${field.id}. Retired=${retiredDate ?? "none"}, Appended=${appendedDate ?? "none"}`,
        );
      } catch (error) {
        failedCount += 1;
        this.logger.error(
          `Failed to roll slots for fieldId=${field.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `Midnight slot-roll phase finished. Processed=${processedCount}, Failed=${failedCount}`,
    );

    // 2. Book membership slots for upcoming week with enhanced validation
    // Use timezone-aware date in Nepal timezone
    const nowInNepal = DateTime.now().setZone("Asia/Kathmandu");
    const todayInNepal = nowInNepal.startOf("day");
    const dayOfWeek = todayInNepal.weekday % 7; // Convert luxon weekday (1-7) to JS weekday (0-6)
    const dayNames = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const todayDayName = dayNames[dayOfWeek];

    // We need to check and book slots for the next 30 days to cover membership bookings
    const upcomingDates: string[] = [];
    for (let i = 1; i <= 30; i++) {
      const futureDateTime = todayInNepal.plus({ days: i });
      const dateStr = futureDateTime.toFormat("yyyy-MM-dd");
      upcomingDates.push(dateStr);
    }

    const plans = await this.membershipPlanRepo.find({
      where: { active: true },
      relations: ["field", "user"],
    });

    this.logger.log(`Found ${plans.length} active membership plans`);
    this.logger.log(`Upcoming dates to check: ${upcomingDates.join(", ")}`);

    let membershipProcessed = 0;
    let membershipSkipped = 0;
    let membershipCreated = 0;

    for (const plan of plans) {
      if (!plan.field || !plan.user) continue;

      this.logger.log(
        `Processing membership plan: User=${plan.user.name}, Field=${plan.field.fieldName}`,
      );

      // For each day-schedule in the plan, evaluate upcoming dates
      const planDaySchedules =
        plan.daysOfWeek as unknown as MembershipDaySchedule[];

      for (const daySchedule of planDaySchedules) {
        for (const upcomingDate of upcomingDates) {
          const upcomingDateTime = DateTime.fromISO(upcomingDate, {
            zone: "Asia/Kathmandu",
          });
          const upcomingDayName = dayNames[upcomingDateTime.weekday % 7 || 0];

          if (daySchedule.day !== upcomingDayName) continue;

          // Check if the upcoming date is on or after this day's membership start date
          if (upcomingDate < daySchedule.startDate) continue;

          this.logger.log(
            `Found matching date ${upcomingDate} (${upcomingDayName}) - attempting to book slot for field ${plan.field.id} at ${daySchedule.startTime}-${daySchedule.endTime}`,
          );

          // Check for conflicting plans for this specific day/time
          const conflictingPlans = plans.filter((otherPlan) => {
            if (otherPlan.id === plan.id) return false;
            if (!otherPlan.field || otherPlan.field.id !== plan.field.id)
              return false;

            const otherSchedules = (otherPlan.daysOfWeek as any[]) || [];
            return otherSchedules.some(
              (s) =>
                s.day === upcomingDayName &&
                this.timeRangesOverlap(
                  daySchedule.startTime,
                  daySchedule.endTime,
                  s.startTime,
                  s.endTime,
                ),
            );
          });

          if (conflictingPlans.length > 0) {
            this.logger.warn(
              `Multiple membership plans conflict for ${upcomingDate} ${daySchedule.startTime}-${daySchedule.endTime}: ${conflictingPlans.map((p) => p.user?.name || "Unknown").join(", ")}. Skipping this slot.`,
            );
            membershipSkipped++;
            continue;
          }

          try {
            const booked = await this.fieldSlotRepo.manager.transaction(
              async (manager) => {
                // First check if slot exists and get its current status
                const existingSlot = await manager
                  .getRepository(FieldSlot)
                  .createQueryBuilder("slot")
                  .where("slot.field_id = :fieldId", { fieldId: plan.field.id })
                  .andWhere("slot.slot_date = :slotDate", {
                    slotDate: upcomingDate,
                  })
                  .andWhere("slot.start_time = :startTime", {
                    startTime: daySchedule.startTime,
                  })
                  .andWhere("slot.end_time = :endTime", {
                    endTime: daySchedule.endTime,
                  })
                  .getOne();

                if (!existingSlot) {
                  this.logger.warn(
                    `Slot not found for membership user ${plan.user.id} on field ${plan.field.id} at ${daySchedule.startTime} for date ${upcomingDate}`,
                  );
                  return false;
                }

                if (
                  existingSlot.slotType === "membership" &&
                  existingSlot.status === "booked"
                ) {
                  const existingBooking = await manager
                    .getRepository(Booking)
                    .createQueryBuilder("booking")
                    .where("booking.slot_id = :slotId", {
                      slotId: existingSlot.id,
                    })
                    .andWhere("booking.booking_type = :bookingType", {
                      bookingType: "membership",
                    })
                    .getOne();

                  if (existingBooking) return false;
                }

                // Get slot with pessimistic lock for update
                const slot = await manager
                  .getRepository(FieldSlot)
                  .createQueryBuilder("slot")
                  .where("slot.field_id = :fieldId", { fieldId: plan.field.id })
                  .andWhere("slot.slot_date = :slotDate", {
                    slotDate: upcomingDate,
                  })
                  .andWhere("slot.start_time = :startTime", {
                    startTime: daySchedule.startTime,
                  })
                  .andWhere("slot.end_time = :endTime", {
                    endTime: daySchedule.endTime,
                  })
                  .setLock("pessimistic_write")
                  .getOne();

                if (!slot) return false;

                // Calculate per-day price from monthlyPrice
                if (daySchedule.monthlyPrice) {
                  const perSlot = (
                    parseFloat(daySchedule.monthlyPrice as any) / 30
                  ).toFixed(2);
                  slot.price = perSlot;
                }

                // If slot is booked for non-membership, override it with membership booking
                if (
                  slot.status === "booked" &&
                  slot.slotType !== "membership"
                ) {
                  slot.status = "booked";
                  slot.slotType = "membership";

                  const existingBooking = await manager
                    .getRepository(Booking)
                    .createQueryBuilder("booking")
                    .where("booking.slot_id = :slotId", { slotId: slot.id })
                    .getOne();
                  if (existingBooking) {
                    existingBooking.userId = plan.user.id;
                    existingBooking.bookingType = "membership";
                    existingBooking.totalAmount = "0";
                    await manager.save(Booking, existingBooking);
                  }

                  await manager.save(FieldSlot, slot);
                  return {
                    slotId: slot.id,
                    userId: plan.user.id,
                    fieldId: plan.field.id,
                    date: upcomingDate,
                    action: "overridden",
                  };
                }

                // Check existing booking for this slot
                let booking = await manager
                  .getRepository(Booking)
                  .createQueryBuilder("booking")
                  .where("booking.slot_id = :slotId", { slotId: slot.id })
                  .getOne();

                if (booking) {
                  if (
                    booking.userId === plan.user.id &&
                    booking.bookingType === "membership"
                  ) {
                    slot.status = "booked";
                    slot.slotType = "membership";
                    await manager.save(FieldSlot, slot);
                    return {
                      slotId: slot.id,
                      userId: plan.user.id,
                      fieldId: plan.field.id,
                      date: upcomingDate,
                      action: "updated",
                    };
                  }
                  return false;
                }

                // If slot is available, book it for membership
                slot.status = "booked";
                slot.slotType = "membership";
                await manager.save(FieldSlot, slot);

                booking = this.bookingRepo.create({
                  fieldId: plan.field.id,
                  slotId: slot.id,
                  userId: plan.user.id,
                  status: "booked",
                  totalAmount: "0",
                  bookingType: "membership",
                });
                await manager.save(Booking, booking);

                return {
                  slotId: slot.id,
                  userId: plan.user.id,
                  fieldId: plan.field.id,
                  date: upcomingDate,
                  action: "created",
                };
              },
            );

            if (booked) {
              if (booked.action === "created") membershipCreated++;
              else membershipProcessed++;
              this.logger.log(
                `${booked.action === "updated" ? "Updated" : booked.action === "overridden" ? "Overridden" : "Created"} membership booking for slot ${booked.slotId} user ${booked.userId} on field ${booked.fieldId} for date ${booked.date}`,
              );
            } else membershipSkipped++;
          } catch (error) {
            membershipSkipped++;
            if (
              error &&
              typeof error === "object" &&
              "code" in error &&
              (error.code === "23505" || error.code === "SQLITE_CONSTRAINT")
            ) {
              this.logger.warn(
                `Slot already booked for membership user ${plan.user.id} on field ${plan.field.id} at ${daySchedule.startTime} for date ${upcomingDate}`,
              );
            } else {
              this.logger.error(
                `Failed to book slot for membership user ${plan.user.id} on field ${plan.field.id} at ${daySchedule.startTime} for date ${upcomingDate}: ${error instanceof Error ? error.stack : String(error)}`,
              );
            }
          }
        }
      }
    }
    this.logger.log(
      `Membership slot booking finished. Created=${membershipCreated}, Updated=${membershipProcessed}, Skipped=${membershipSkipped}`,
    );
    this.logger.log(
      `Midnight slot cron finished. SlotRollProcessed=${processedCount}, SlotRollFailed=${failedCount}, MembershipCreated=${membershipCreated}, MembershipUpdated=${membershipProcessed}, MembershipSkipped=${membershipSkipped}`,
    );
  }
}
