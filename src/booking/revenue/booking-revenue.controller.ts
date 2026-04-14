import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
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

  @UseGuards(JwtAuthGuard)
  @Get("field/:fieldId/revenue/pdf")
  async downloadBookingPdf(
    @CurrentAccount() account: AuthenticatedAccount,
    @Param("fieldId", new ParseUUIDPipe()) fieldId: string,
    @Query() query: GetFieldBookingRevenueQueryDto,
    @Res() response: Response,
  ) {
    const { buffer, filename } =
      await this.bookingRevenueService.downloadBookingPdf(
        account,
        fieldId,
        query,
      );

    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    response.setHeader("Content-Length", buffer.length.toString());

    return response.status(200).send(buffer);
  }
}
