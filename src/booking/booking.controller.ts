import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { ConfirmBookingDto } from "./dto/confirm-booking.dto";
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
    @Body() confirmBookingDto: ConfirmBookingDto,
  ) {
    return this.bookingService.confirmBooking(
      account,
      slotId,
      confirmBookingDto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("field/:fieldId")
  listBookingsByField(
    @CurrentAccount() account: AuthenticatedAccount,
    @Param("fieldId", new ParseUUIDPipe()) fieldId: string,
  ) {
    return this.bookingService.listBookingsByField(account, fieldId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  getBookingById(
    @CurrentAccount() account: AuthenticatedAccount,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.bookingService.getBookingById(account, id);
  }
}
