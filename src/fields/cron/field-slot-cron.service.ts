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
      `Midnight slot cron finished. Processed=${processedCount}, Failed=${failedCount}`,
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
      // Find slot for next week (using local date string)
      const slot = await this.fieldSlotRepo.findOne({
        where: {
          field: { id: plan.field.id },
          slotDate: nextWeekStr,
          startTime: plan.startTime,
          endTime: plan.endTime,
        },
      });
      if (slot && slot.status === "available") {
        // Book the slot for the membership user
        await this.bookingRepo.save(
          this.bookingRepo.create({
            fieldId: plan.field.id,
            slotId: slot.id,
            userId: plan.user.id,
            status: "booked",
            extraAmount: "0",
            bookingType: "membership",
          }),
        );
        slot.status = "booked";
        slot.slotType = "membership";
        await this.fieldSlotRepo.save(slot);
        membershipProcessed++;
        this.logger.log(
          `Blocked slot ${slot.id} for membership user ${plan.user.id} on field ${plan.field.id}`,
        );
      }
    }
    this.logger.log(
      `Membership slot booking finished. Processed=${membershipProcessed}`,
    );
  }
}
