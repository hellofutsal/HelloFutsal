import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserAccount } from "../auth/entities/user.entity";
import { Booking } from "./entities/booking.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";

@Module({
  imports: [TypeOrmModule.forFeature([Booking, FieldSlot, UserAccount])],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
