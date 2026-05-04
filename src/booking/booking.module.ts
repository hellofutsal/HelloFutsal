import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserAccount } from "../auth/entities/user.entity";
import { MembershipPlan } from "./entities/membership-plan.entity";
import { MembershipPaymentController } from "./membership-payment.controller";
import { MembershipPaymentService } from "./membership-payment.service";
import { Booking } from "./entities/booking.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";
import { MembershipPlanController } from "./membership-plan.controller";
import { BookingRevenueModule } from "./revenue/booking-revenue.module";
import { Field } from "../fields/entities/field.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      FieldSlot,
      UserAccount,
      MembershipPlan,
      Field,
      // membership payments
      require("./entities/membership-payment.entity").MembershipPayment,
    ]),
    BookingRevenueModule,
  ],
  controllers: [
    BookingController,
    MembershipPlanController,
    MembershipPaymentController,
  ],
  providers: [BookingService, MembershipPaymentService],
})
export class BookingModule {}
