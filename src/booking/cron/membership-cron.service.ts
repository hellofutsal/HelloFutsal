import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MembershipPlan } from "../entities/membership-plan.entity";
import { Booking } from "../entities/booking.entity";
import { FieldSlot } from "../../fields/entities/field-slot.entity";

@Injectable()
export class MembershipCronService {
  private readonly logger = new Logger(MembershipCronService.name);

  constructor(
    @InjectRepository(MembershipPlan)
    private readonly membershipPlanRepo: Repository<MembershipPlan>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotRepo: Repository<FieldSlot>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  // Runs every day at 00:02 (after field slot cron)
  @Cron("2 0 * * *")
  async blockUpcomingMembershipSlots() {
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
        this.logger.log(
          `Blocked slot ${slot.id} for membership user ${plan.user.id} on field ${plan.field.id}`,
        );
      }
    }
  }
}
