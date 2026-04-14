import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentAccount } from "../../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AuthenticatedAccount } from "../../auth/types/authenticated-account.type";
import { BookingRevenueService } from "./booking-revenue.service";
import { GetFieldBookingRevenueQueryDto } from "./dto/get-field-booking-revenue-query.dto";

@Controller("bookings")
export class BookingRevenueController {
  constructor(private readonly bookingRevenueService: BookingRevenueService) {}

  @UseGuards(JwtAuthGuard)
  @Get("field/:fieldId/revenue")
  getFieldRevenue(
    @CurrentAccount() account: AuthenticatedAccount,
    @Param("fieldId", new ParseUUIDPipe()) fieldId: string,
    @Query() query: GetFieldBookingRevenueQueryDto,
  ) {
    return this.bookingRevenueService.getFieldRevenue(account, fieldId, query);
  }
}
