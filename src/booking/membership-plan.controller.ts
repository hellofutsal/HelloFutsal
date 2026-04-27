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
    const field = await this.fieldRepo.findOneByOrFail({ id: dto.fieldId });
    const plan = this.membershipPlanRepo.create({
      user,
      field,
      daysOfWeek: dto.daysOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      active: dto.active,
      userName: dto.userName,
      phoneNumber: dto.phoneNumber,
    });
    await this.membershipPlanRepo.save(plan);

    // Sync with existing slots: find all future slots for this field, time, and available, for all selected days
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const allSlots = await this.fieldSlotRepo
      .createQueryBuilder("slot")
      .where("slot.field_id = :fieldId", { fieldId: field.id })
      .andWhere("slot.start_time = :startTime", { startTime: dto.startTime })
      .andWhere("slot.end_time = :endTime", { endTime: dto.endTime })
      .andWhere("slot.status = :status", { status: "available" })
      .andWhere("slot.slot_date >= :today", { today: todayStr })
      .getMany();

    // Helper to map JS getDay() to string
    const dayNames = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    let syncedCount = 0;
    for (const slot of allSlots) {
      const slotDate = new Date(slot.slotDate);
      const slotDayName = dayNames[slotDate.getDay()];
      if (!dto.daysOfWeek.includes(slotDayName)) continue;
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
      syncedCount++;
    }

    return { success: true, plan, syncedSlots: syncedCount };
  }
}
