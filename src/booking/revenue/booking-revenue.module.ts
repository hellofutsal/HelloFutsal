import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Field } from "../../fields/entities/field.entity";
import { FieldSlot } from "../../fields/entities/field-slot.entity";
import { Booking } from "../entities/booking.entity";
import { TournamentBooking } from "../../tournament/entities/tournament-booking.entity";
import { BookingRevenueController } from "./booking-revenue.controller";
import { BookingRevenueService } from "./booking-revenue.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Field, FieldSlot, TournamentBooking]),
  ],
  controllers: [BookingRevenueController],
  providers: [BookingRevenueService],
})
export class BookingRevenueModule {}
