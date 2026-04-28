import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Field } from "../entities/field.entity";
import { FieldSlotGenerator } from "./field-slot-generator";
import { FieldSlotSyncService } from "./field-slot-sync.service";
import { MembershipPlan } from "../../booking/entities/membership-plan.entity";
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

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  // @Cron("*/3 * * * *")
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
    const today = new Date();
    const dayOfWeek = today.getDay();
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
    
    // We need to check and book slots for the next 7 days (not just next week)
    const upcomingDates: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i);
      const dateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, "0")}-${String(futureDate.getDate()).padStart(2, "0")}`;
      upcomingDates.push(dateStr);
    }

    const plans = await this.membershipPlanRepo.find({
      where: { active: true },
      relations: ["field", "user"],
    });
    let membershipProcessed = 0;
    let membershipSkipped = 0;
    let membershipCreated = 0;
    
    for (const plan of plans) {
      if (!plan.field || !plan.user) continue;
      
      // Check each upcoming date for this membership plan
      for (const upcomingDate of upcomingDates) {
        // Get day name for this upcoming date
        const upcomingDateObj = new Date(upcomingDate);
        const upcomingDayName = dayNames[upcomingDateObj.getDay()];
        
        // Check if this day is in the membership plan's days
        if (!plan.daysOfWeek.includes(upcomingDayName)) continue;
        
        try {
          const booked = await this.fieldSlotRepo.manager.transaction(
            async (manager) => {
              // First check if slot exists and get its current status
              const existingSlot = await manager
                .getRepository(FieldSlot)
                .createQueryBuilder("slot")
                .where("slot.field_id = :fieldId", { fieldId: plan.field.id })
                .andWhere("slot.slot_date = :slotDate", { slotDate: upcomingDate })
                .andWhere("slot.start_time = :startTime", {
                  startTime: plan.startTime,
                })
                .andWhere("slot.end_time = :endTime", { endTime: plan.endTime })
                .getOne();

              if (!existingSlot) {
                this.logger.warn(
                  `Slot not found for membership user ${plan.user.id} on field ${plan.field.id} at ${plan.startTime} for date ${upcomingDate}`,
                );
                return false;
              }

              // Check if slot is already booked for membership type
              if (existingSlot.slotType === "membership" && existingSlot.status === "booked") {
                const existingBooking = await manager
                  .getRepository(Booking)
                  .createQueryBuilder("booking")
                  .where("booking.slot_id = :slotId", { slotId: existingSlot.id })
                  .andWhere("booking.booking_type = :bookingType", { bookingType: "membership" })
                  .getOne();

                if (existingBooking) {
                  this.logger.log(
                    `Slot ${existingSlot.id} already booked for membership user ${existingBooking.userId} on field ${plan.field.id}`,
                  );
                  return false;
                }
              }

              // Get slot with pessimistic lock for update
              const slot = await manager
                .getRepository(FieldSlot)
                .createQueryBuilder("slot")
                .where("slot.field_id = :fieldId", { fieldId: plan.field.id })
                .andWhere("slot.slot_date = :slotDate", { slotDate: upcomingDate })
                .andWhere("slot.start_time = :startTime", {
                  startTime: plan.startTime,
                })
                .andWhere("slot.end_time = :endTime", { endTime: plan.endTime })
                .setLock("pessimistic_write")
                .getOne();

              if (!slot) return false;

              // Check if slot is available for membership booking
              if (slot.status === "booked" && slot.slotType !== "membership") {
                this.logger.warn(
                  `Slot ${slot.id} already booked for non-membership on field ${plan.field.id} at ${plan.startTime} for date ${upcomingDate}`,
                );
                return false;
              }

              // Calculate per-day price from monthlyPrice if set
              if (plan.monthlyPrice) {
                const perDayPrice = (parseFloat(plan.monthlyPrice) / 30).toFixed(2);
                slot.price = perDayPrice;
              }

              // Check existing booking for this slot
              let booking = await manager
                .getRepository(Booking)
                .createQueryBuilder("booking")
                .where("booking.slot_id = :slotId", { slotId: slot.id })
                .getOne();

              if (booking) {
                // If already booked for this user as membership, update slot price and type
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
                // Otherwise, skip (already booked by someone else)
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
                extraAmount: "0",
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
            if (booked.action === "created") {
              membershipCreated++;
            } else {
              membershipProcessed++;
            }
            this.logger.log(
              `${booked.action === 'updated' ? 'Updated' : 'Created'} membership booking for slot ${booked.slotId} user ${booked.userId} on field ${booked.fieldId} for date ${booked.date}`,
            );
          } else {
            membershipSkipped++;
          }
        } catch (error) {
          membershipSkipped++;
          // Handle unique constraint violation or log error
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error.code === "23505" || error.code === "SQLITE_CONSTRAINT")
          ) {
            this.logger.warn(
              `Slot already booked for membership user ${plan.user.id} on field ${plan.field.id} at ${plan.startTime} for date ${upcomingDate}`,
            );
          } else {
            this.logger.error(
              `Failed to book slot for membership user ${plan.user.id} on field ${plan.field.id} at ${plan.startTime} for date ${upcomingDate}: ${error instanceof Error ? error.stack : String(error)}`,
            );
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
