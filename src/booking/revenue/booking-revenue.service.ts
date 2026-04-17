import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import PDFDocument from "pdfkit";
import { AuthenticatedAccount } from "../../auth/types/authenticated-account.type";
import { Field } from "../../fields/entities/field.entity";
import { Booking } from "../entities/booking.entity";
import { GetFieldBookingRevenueQueryDto } from "./dto/get-field-booking-revenue-query.dto";

@Injectable()
export class BookingRevenueService {
  private static readonly MAX_REPORT_DAYS = 31;
  private static readonly MAX_REPORT_BOOKINGS = 500;

  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(Field)
    private readonly fieldsRepository: Repository<Field>,
  ) {}

  async getFieldRevenue(
    account: AuthenticatedAccount,
    fieldId: string,
    query: GetFieldBookingRevenueQueryDto,
  ) {
    this.ensureAdmin(account);

    const field = await this.fieldsRepository
      .createQueryBuilder("field")
      .select("field.id", "id")
      .addSelect("field.venueName", "venueName")
      .addSelect("field.fieldName", "fieldName")
      .where("field.id = :fieldId", { fieldId })
      .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
      .getRawOne<{ id: string; venueName: string; fieldName: string }>();

    if (!field) {
      throw new NotFoundException("Field not found");
    }

    if (
      (query.startDate && !query.endDate) ||
      (!query.startDate && query.endDate)
    ) {
      throw new ConflictException(
        "startDate and endDate must be provided together",
      );
    }

    if (query.startDate && query.endDate && query.endDate < query.startDate) {
      throw new ConflictException("endDate must be on or after startDate");
    }

    const baseQuery = this.bookingsRepository
      .createQueryBuilder("booking")
      .innerJoin("booking.slot", "slot")
      .innerJoin("booking.field", "field")
      .where("booking.field_id = :fieldId", { fieldId })
      .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
      .andWhere("booking.status = :completedStatus", {
        completedStatus: "completed",
      });

    const totalRevenueRaw = await baseQuery
      .clone()
      .select(
        "COALESCE(SUM(slot.price::numeric + booking.extra_amount::numeric), 0)",
        "revenue",
      )
      .getRawOne<{ revenue: string }>();

    let selectedPeriodRevenue = totalRevenueRaw?.revenue ?? "0";

    if (query.startDate && query.endDate) {
      const selectedRevenueRaw = await baseQuery
        .clone()
        .andWhere("slot.slot_date BETWEEN :startDate AND :endDate", {
          startDate: query.startDate,
          endDate: query.endDate,
        })
        .select(
          "COALESCE(SUM(slot.price::numeric + booking.extra_amount::numeric), 0)",
          "revenue",
        )
        .getRawOne<{ revenue: string }>();

      selectedPeriodRevenue = selectedRevenueRaw?.revenue ?? "0";
    }

    return {
      fieldId,
      totalRevenueTillNow: totalRevenueRaw?.revenue ?? "0",
      selectedPeriodRevenue,
      dateRange:
        query.startDate && query.endDate
          ? {
              startDate: query.startDate,
              endDate: query.endDate,
            }
          : null,
    };
  }

  async downloadBookingPdf(
    account: AuthenticatedAccount,
    fieldId: string,
    query: GetFieldBookingRevenueQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.ensureAdmin(account);

    const field = await this.fieldsRepository
      .createQueryBuilder("field")
      .select("field.id", "id")
      .addSelect("field.venueName", "venueName")
      .addSelect("field.fieldName", "fieldName")
      .where("field.id = :fieldId", { fieldId })
      .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
      .getRawOne<{ id: string; venueName: string; fieldName: string }>();

    if (!field) {
      throw new NotFoundException("Field not found");
    }

    if (
      (query.startDate && !query.endDate) ||
      (!query.startDate && query.endDate)
    ) {
      throw new ConflictException(
        "startDate and endDate must be provided together",
      );
    }

    if (query.startDate && query.endDate && query.endDate < query.startDate) {
      throw new ConflictException("endDate must be on or after startDate");
    }

    this.ensureBoundedReportWindow(query);

    const bookingsQuery = this.bookingsRepository
      .createQueryBuilder("booking")
      .innerJoinAndSelect("booking.user", "user")
      .innerJoinAndSelect("booking.slot", "slot")
      .innerJoinAndSelect("booking.field", "field")
      .where("booking.field_id = :fieldId", { fieldId })
      .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
      .andWhere("booking.status = :completedStatus", {
        completedStatus: "completed",
      });

    if (query.startDate && query.endDate) {
      bookingsQuery.andWhere("slot.slot_date BETWEEN :startDate AND :endDate", {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    }

    const bookings = await bookingsQuery
      .orderBy("slot.slot_date", "ASC")
      .addOrderBy("slot.start_time", "ASC")
      .getMany();

    if (bookings.length > BookingRevenueService.MAX_REPORT_BOOKINGS) {
      throw new ConflictException(
        `PDF export is limited to ${BookingRevenueService.MAX_REPORT_BOOKINGS} bookings`,
      );
    }

    const totalRevenue = bookings.reduce((sum, booking) => {
      const price = Number(booking.slot.price);
      const extraAmount = Number(booking.extraAmount);
      const safePrice = Number.isNaN(price) ? 0 : price;
      const safeExtraAmount = Number.isNaN(extraAmount) ? 0 : extraAmount;

      return sum + safePrice + safeExtraAmount;
    }, 0);

    const buffer = await this.createMonthlyBookingsPdfBuffer({
      venueName: field.venueName,
      fieldName: field.fieldName,
      bookings,
      totalRevenue,
      dateRange:
        query.startDate && query.endDate
          ? {
              startDate: query.startDate,
              endDate: query.endDate,
            }
          : null,
    });

    return {
      buffer,
      filename: `field-${fieldId}-bookings.pdf`,
    };
  }

  private ensureAdmin(account: AuthenticatedAccount): void {
    if (account.role !== "admin") {
      throw new ForbiddenException("Only admins can view revenue");
    }
  }

  private ensureBoundedReportWindow(
    query: GetFieldBookingRevenueQueryDto,
  ): void {
    if (!query.startDate || !query.endDate) {
      throw new ConflictException(
        "startDate and endDate are required for PDF export",
      );
    }

    const [startYear, startMonth, startDay] = query.startDate
      .split("-")
      .map(Number);
    const [endYear, endMonth, endDay] = query.endDate.split("-").map(Number);

    const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
    const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
    const dayDifference = (endUtc - startUtc) / (1000 * 60 * 60 * 24);

    if (dayDifference < 0) {
      throw new ConflictException("endDate must be on or after startDate");
    }

    if (dayDifference > BookingRevenueService.MAX_REPORT_DAYS - 1) {
      throw new ConflictException(
        `PDF export is limited to ${BookingRevenueService.MAX_REPORT_DAYS} days`,
      );
    }
  }

  private async createMonthlyBookingsPdfBuffer(details: {
    venueName: string;
    fieldName: string;
    bookings: Booking[];
    totalRevenue: number;
    dateRange: { startDate: string; endDate: string } | null;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 14,
      });
      const chunks: Buffer[] = [];

      document.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);

      const leftX = document.page.margins.left;
      const topY = document.page.margins.top;
      const pageWidth =
        document.page.width -
        document.page.margins.left -
        document.page.margins.right;

      const formatCurrency = (value: number): string =>
        `NPR ${value.toFixed(2)}`;
      const formatAmount = (value: number): string =>
        Number.isNaN(value) ? "NPR 0.00" : formatCurrency(value);
      const formatDateLabel = (value: string): string => {
        const parsed = new Date(`${value}T00:00:00`);

        if (Number.isNaN(parsed.getTime())) {
          return value;
        }

        return new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(parsed);
      };

      const columns = [
        { label: "#", width: 22 },
        { label: "Booking ID", width: 108 },
        { label: "Customer / Mobile", width: 132 },
        { label: "Date", width: 72 },
        { label: "Time", width: 84 },
        { label: "Base", width: 52 },
        { label: "Extra", width: 52 },
        { label: "Total", width: 52 },
        { label: "Status", width: 60 },
      ];

      const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
      const scale = tableWidth > pageWidth ? pageWidth / tableWidth : 1;
      const scaledColumns = columns.map((column) => ({
        ...column,
        width: column.width * scale,
      }));
      const tableAreaWidth = scaledColumns.reduce(
        (sum, column) => sum + column.width,
        0,
      );

      document
        .fillColor("#0f172a")
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("Booking Report", leftX, topY + 2, {
          align: "center",
          width: tableAreaWidth,
        });

      document
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text(`${details.venueName} - ${details.fieldName}`, leftX, topY + 20, {
          align: "center",
          width: tableAreaWidth,
        });

      document
        .fillColor("#475569")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text("PAN NO :", leftX, topY + 28, {
          align: "left",
          width: 120,
        });

      if (details.dateRange) {
        document
          .fillColor("#475569")
          .font("Helvetica")
          .fontSize(7)
          .text(
            `Period: ${formatDateLabel(details.dateRange.startDate)} to ${formatDateLabel(details.dateRange.endDate)}`,
            leftX,
            topY + 36,
            { align: "center", width: tableAreaWidth },
          );
      }

      let y = topY + 52;
      const headerHeight = 12;
      const rowHeight = 16;

      const drawRow = (values: string[], isHeader = false) => {
        let x = leftX;

        values.forEach((value, index) => {
          const column = scaledColumns[index];
          const height = isHeader ? headerHeight : rowHeight;

          document
            .save()
            .lineWidth(isHeader ? 1 : 0.75)
            .strokeColor(isHeader ? "#94a3b8" : "#cbd5e1")
            .rect(x, y, column.width, height)
            .stroke()
            .restore();

          document
            .fillColor("#0f172a")
            .font(isHeader ? "Helvetica-Bold" : "Helvetica")
            .fontSize(isHeader ? 6.5 : 6)
            .text(value, x + 4, y + (isHeader ? 2 : 3), {
              width: column.width - 12,
              ellipsis: true,
            });

          x += column.width;
        });

        y += isHeader ? headerHeight : rowHeight;
      };

      const drawTableHeader = () => {
        drawRow(
          columns.map((column) => column.label),
          true,
        );
      };

      const ensureSpace = (height = rowHeight, redrawHeader = true) => {
        if (y + height > document.page.height - document.page.margins.bottom) {
          document.addPage();
          y = document.page.margins.top;
          if (redrawHeader) {
            drawTableHeader();
          }
        }
      };

      ensureSpace(headerHeight + 2, false);
      drawTableHeader();

      if (details.bookings.length === 0) {
        ensureSpace();
        drawRow([
          "-",
          "No bookings found",
          "-",
          "-",
          "-",
          "0.00",
          "0.00",
          "0.00",
          "-",
        ]);
      } else {
        details.bookings.forEach((booking, index) => {
          ensureSpace();
          const price = Number(booking.slot.price);
          const extraAmount = Number(booking.extraAmount);
          const safePrice = Number.isNaN(price) ? 0 : price;
          const safeExtraAmount = Number.isNaN(extraAmount) ? 0 : extraAmount;
          drawRow([
            String(index + 1),
            booking.id,
            `${booking.user.name ?? "Unknown"}\n${booking.user.mobileNumber ?? "Unknown"}`,
            booking.slot.slotDate,
            `${booking.slot.startTime} - ${booking.slot.endTime}`,
            formatAmount(safePrice),
            formatAmount(safeExtraAmount),
            formatAmount(safePrice + safeExtraAmount),
            booking.status,
          ]);
        });
      }

      ensureSpace();
      drawRow(
        [
          "",
          "Total",
          "",
          "",
          "",
          "",
          "",
          formatCurrency(details.totalRevenue),
          String(details.bookings.length),
        ],
        false,
      );

      let signatureLineY = y + 14;
      if (
        signatureLineY + 24 >
        document.page.height - document.page.margins.bottom
      ) {
        document.addPage();
        y = document.page.margins.top;
        signatureLineY = y + 14;
      }

      const signatureBlockWidth = 110;
      const signatureBlockX = leftX + tableAreaWidth - signatureBlockWidth;

      document
        .moveTo(signatureBlockX, signatureLineY)
        .lineTo(signatureBlockX + signatureBlockWidth, signatureLineY)
        .lineWidth(0.6)
        .strokeColor("#0f172a")
        .stroke();

      document
        .fillColor("#0f172a")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text("Authorized Signature", signatureBlockX, signatureLineY + 8, {
          width: signatureBlockWidth,
          align: "center",
        });

      document
        .fillColor("#64748b")
        .font("Helvetica")
        .fontSize(6)
        .text("Admin / Owner", signatureBlockX, signatureLineY + 22, {
          width: signatureBlockWidth,
          align: "center",
        });

      document.end();
    });
  }
}
