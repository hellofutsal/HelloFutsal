import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FieldRuleBook } from "./entities/field-rule-book.entity";
import { FieldScheduleSettings } from "./entities/field-schedule-settings.entity";
import { Field } from "./entities/field.entity";
import { FieldSlot } from "./entities/field-slot.entity";
import { GroundOwnerAccount } from "../auth/entities/ground-owner.entity";
import { MembershipPlan } from "../booking/entities/membership-plan.entity";
import { Booking } from "../booking/entities/booking.entity";
import { FieldSlotCronService } from "./cron/field-slot-cron.service";
import { FieldSlotSyncService } from "./cron/field-slot-sync.service";
import { FieldsController } from "./fields.controller";
import { FieldsService } from "./fields.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Field,
      FieldScheduleSettings,
      FieldRuleBook,
      FieldSlot,
      GroundOwnerAccount,
      MembershipPlan,
      Booking,
    ]),
  ],
  controllers: [FieldsController],
  providers: [FieldsService, FieldSlotCronService, FieldSlotSyncService],
  exports: [FieldsService],
})
export class FieldsModule {}
