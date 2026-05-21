import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
} from "@nestjs/common";
import { TournamentService } from "./tournament.service";
import { CreateTournamentBookingDto } from "./dto/create-tournament-booking.dto";
import { CompleteTournamentDto } from "./dto/complete-tournament.dto";
import { UpdateTournamentBookingDto } from "./dto/update-tournament-booking.dto";
import { RecordPaymentDto } from "./dto/record-payment.dto";
import { CancelTournamentDto } from "./dto/cancel-tournament.dto";

@Controller("tournaments")
export class TournamentController {
  constructor(private readonly svc: TournamentService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  create(@Body() dto: CreateTournamentBookingDto) {
    return this.svc.create(dto);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTournamentBookingDto) {
    return this.svc.update(id, dto);
  }

  @Post(":id/payments")
  recordPayment(@Param("id") id: string, @Body() dto: RecordPaymentDto) {
    return this.svc.recordPayment(id, dto.amount, dto.method, dto.note);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Body() body: CancelTournamentDto) {
    return this.svc.cancel(id, body.refund, body.refundAmount);
  }

  @Post(":id/complete")
  complete(@Param("id") id: string, @Body() dto: CompleteTournamentDto) {
    return this.svc.markCompleted(id, dto.remainingAmount, dto.method);
  }
}
