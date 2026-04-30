import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserAccount } from "../auth/entities/user.entity";
import { MembershipPlan } from "./entities/membership-plan.entity";
import { Booking } from "./entities/booking.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";
import { MembershipPlanController } from "./membership-plan.controller";
import { BookingRevenueModule } from "./revenue/booking-revenue.module";
import { Field } from "../fields/entities/field.entity";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      FieldSlot,
      UserAccount,
      MembershipPlan,
      Field,
    ]),
    BookingRevenueModule,
    NotificationsModule,
  ],
  controllers: [BookingController, MembershipPlanController],
  providers: [BookingService],
})
export class BookingModule {}
