import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { BookingService } from "./booking.service";

@Controller("bookings")
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createBooking(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() createBookingDto: CreateBookingDto,
  ) {
    return this.bookingService.createBooking(account, createBookingDto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":slotId/confirm")
  confirmBooking(
    @CurrentAccount() account: AuthenticatedAccount,
    @Param("slotId", new ParseUUIDPipe()) slotId: string,
  ) {
    return this.bookingService.confirmBooking(account, slotId);
  }
}
