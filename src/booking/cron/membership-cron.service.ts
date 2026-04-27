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

  // Runs every day at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async blockUpcomingMembershipSlots() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const plans = await this.membershipPlanRepo.find({
      where: { active: true },
    });
    for (const plan of plans) {
      if (plan.dayOfWeek !== dayOfWeek) continue;
      // Find slot for next week
      const slot = await this.fieldSlotRepo.findOne({
        where: {
          field: { id: plan.field.id },
          slotDate: nextWeek.toISOString().slice(0, 10),
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
