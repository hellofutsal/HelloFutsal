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

    // 2. Book membership slots
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
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    // Format nextWeek as YYYY-MM-DD in local time
    const nextWeekStr = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, "0")}-${String(nextWeek.getDate()).padStart(2, "0")}`;

    const plans = await this.membershipPlanRepo.find({
      where: { active: true },
      relations: ["field", "user"],
    });
    let membershipProcessed = 0;
    for (const plan of plans) {
      if (!plan.field || !plan.user) continue;
      if (
        !plan.daysOfWeek ||
        !Array.isArray(plan.daysOfWeek) ||
        !plan.daysOfWeek.includes(todayDayName)
      )
        continue;
      try {
        const booked = await this.fieldSlotRepo.manager.transaction(
          async (manager) => {
            // Find slot for next week (using local date string) with pessimistic lock
            const slot = await manager
              .getRepository(FieldSlot)
              .createQueryBuilder("slot")
              .where("slot.field_id = :fieldId", { fieldId: plan.field.id })
              .andWhere("slot.slot_date = :slotDate", { slotDate: nextWeekStr })
              .andWhere("slot.start_time = :startTime", {
                startTime: plan.startTime,
              })
              .andWhere("slot.end_time = :endTime", { endTime: plan.endTime })
              .setLock("pessimistic_write")
              .getOne();
            if (!slot || slot.status !== "available") return false;
            // Check for existing booking for this slot
            const existingBooking = await manager
              .getRepository(Booking)
              .findOne({
                where: { slotId: slot.id },
              });
            if (existingBooking) return false;
            // Book the slot for the membership user
            slot.status = "booked";
            slot.slotType = "membership";
            await manager.save(FieldSlot, slot);
            const booking = this.bookingRepo.create({
              fieldId: plan.field.id,
              slotId: slot.id,
              userId: plan.user.id,
              status: "booked",
              extraAmount: "0",
              bookingType: "membership",
            });
            await manager.save(Booking, booking);
            // Only return true if everything succeeded
            return {
              slotId: slot.id,
              userId: plan.user.id,
              fieldId: plan.field.id,
            };
          },
        );
        if (booked) {
          membershipProcessed++;
          this.logger.log(
            `Blocked slot ${booked.slotId} for membership user ${booked.userId} on field ${booked.fieldId}`,
          );
        }
      } catch (error) {
        // Handle unique constraint violation or log error
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error.code === "23505" || error.code === "SQLITE_CONSTRAINT")
        ) {
          this.logger.warn(
            `Slot already booked for membership user ${plan.user.id} on field ${plan.field.id} at ${plan.startTime}`,
          );
        } else {
          this.logger.error(
            `Failed to book slot for membership user ${plan.user.id} on field ${plan.field.id} at ${plan.startTime}: ${error instanceof Error ? error.stack : String(error)}`,
          );
        }
      }
    }
    this.logger.log(
      `Membership slot booking finished. Processed=${membershipProcessed}`,
    );
    this.logger.log(
      `Midnight slot cron finished. SlotRollProcessed=${processedCount}, SlotRollFailed=${failedCount}, MembershipProcessed=${membershipProcessed}`,
    );
  }
}
