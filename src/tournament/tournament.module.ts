import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Booking } from "../booking/entities/booking.entity";
import { UserAccount } from "../auth/entities/user.entity";
import { TournamentBooking } from "./entities/tournament-booking.entity";
import { TournamentPayment } from "./entities/tournament-payment.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { TournamentController } from "./tournament.controller";
import { TournamentService } from "./tournament.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TournamentBooking,
      TournamentPayment,
      FieldSlot,
      UserAccount,
      Booking,
    ]),
  ],
  controllers: [TournamentController],
  providers: [TournamentService],
})
export class TournamentModule {}
