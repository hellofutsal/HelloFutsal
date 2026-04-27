import { Body, Controller, Post } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThanOrEqual } from "typeorm";
import { MembershipPlan } from "./entities/membership-plan.entity";
import { CreateMembershipPlanDto } from "./dto/create-membership-plan.dto";
import { UserAccount } from "../auth/entities/user.entity";
import { Field } from "../fields/entities/field.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { Booking } from "./entities/booking.entity";

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

  @Post()
  async createMembershipPlan(@Body() dto: CreateMembershipPlanDto) {
    const user = await this.userRepo.findOneByOrFail({ id: dto.userId });
    const field = await this.fieldRepo.findOneByOrFail({ id: dto.fieldId });
    const plan = this.membershipPlanRepo.create({
      user,
      field,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      active: dto.active,
    });
    await this.membershipPlanRepo.save(plan);

    // Sync with existing slots: find all future slots for this field, day, and time
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    // Find all slots for this field, matching day of week, time, and available
    const slots = await this.fieldSlotRepo
      .createQueryBuilder("slot")
      .where("slot.field_id = :fieldId", { fieldId: field.id })
      .andWhere("slot.start_time = :startTime", { startTime: dto.startTime })
      .andWhere("slot.end_time = :endTime", { endTime: dto.endTime })
      .andWhere("slot.status = :status", { status: "available" })
      .andWhere("slot.slot_date >= :today", { today: todayStr })
      .getMany();

    for (const slot of slots) {
      // Check if slot's date matches the plan's dayOfWeek
      const slotDate = new Date(slot.slotDate);
      if (slotDate.getDay() !== dto.dayOfWeek) continue;
      // Mark slot as booked and membership
      slot.status = "booked";
      slot.slotType = "membership";
      await this.fieldSlotRepo.save(slot);
      // Create booking for this slot
      await this.bookingRepo.save(
        this.bookingRepo.create({
          fieldId: field.id,
          slotId: slot.id,
          userId: user.id,
          status: "booked",
          extraAmount: "0",
          bookingType: "membership",
        }),
      );
    }

    return { success: true, plan, syncedSlots: slots.length };
  }
}
