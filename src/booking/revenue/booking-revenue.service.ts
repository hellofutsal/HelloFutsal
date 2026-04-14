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
      .where("field.id = :fieldId", { fieldId })
      .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
      .getRawOne<{ id: string }>();

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
      .select("COALESCE(SUM(slot.price::numeric), 0)", "revenue")
      .getRawOne<{ revenue: string }>();

    let selectedPeriodRevenue = totalRevenueRaw?.revenue ?? "0";

    if (query.startDate && query.endDate) {
      const selectedRevenueRaw = await baseQuery
        .clone()
        .andWhere("slot.slot_date BETWEEN :startDate AND :endDate", {
          startDate: query.startDate,
          endDate: query.endDate,
        })
        .select("COALESCE(SUM(slot.price::numeric), 0)", "revenue")
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
      .where("field.id = :fieldId", { fieldId })
      .andWhere("field.owner_id = :ownerId", { ownerId: account.id })
      .getRawOne<{ id: string }>();

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

    const totalRevenue = bookings.reduce((sum, booking) => {
      const price = Number(booking.slot.price);
      return sum + (Number.isNaN(price) ? 0 : price);
    }, 0);

    const buffer = await this.createMonthlyBookingsPdfBuffer({
      fieldName: bookings[0]?.field.venueName ?? "Field",
      courtName: bookings[0]?.field.fieldName ?? "Booking Report",
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

  private async createMonthlyBookingsPdfBuffer(details: {
    fieldName: string;
    courtName: string;
    bookings: Booking[];
    totalRevenue: number;
    dateRange: { startDate: string; endDate: string } | null;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 28,
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

      const drawRoundedBox = (
        x: number,
        y: number,
        width: number,
        height: number,
        strokeColor: string,
        fillColor: string,
      ) => {
        document
          .save()
          .lineWidth(1)
          .fillColor(fillColor)
          .strokeColor(strokeColor)
          .roundedRect(x, y, width, height, 10)
          .fillAndStroke()
          .restore();
      };

      const drawStatCard = (
        x: number,
        y: number,
        width: number,
        title: string,
        value: string,
        accentColor: string,
      ) => {
        drawRoundedBox(x, y, width, 66, "#cbd5e1", "#ffffff");
        document
          .font("Helvetica")
          .fillColor("#475569")
          .fontSize(9)
          .text(title, x + 16, y + 14, { width: width - 32 });
        document
          .font("Helvetica-Bold")
          .fillColor(accentColor)
          .fontSize(19)
          .text(value, x + 16, y + 28, { width: width - 32 });
      };

      document
        .fillColor("#0f172a")
        .font("Helvetica-Bold")
        .fontSize(22)
        .text("Monthly Booking Report", leftX, topY + 2, {
          align: "center",
          width: pageWidth,
        });

      document
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(`${details.fieldName} - ${details.courtName}`, leftX, topY + 46, {
          align: "center",
          width: pageWidth,
        });

      if (details.dateRange) {
        document
          .fillColor("#475569")
          .font("Helvetica")
          .fontSize(9)
          .text(
            `Period: ${formatDateLabel(details.dateRange.startDate)} to ${formatDateLabel(details.dateRange.endDate)}`,
            leftX,
            topY + 62,
            { align: "center", width: pageWidth },
          );
      }

      const cardY = topY + 84;
      const cardGap = 12;
      const cardWidth = (pageWidth - cardGap * 2) / 3;

      drawStatCard(
        leftX,
        cardY,
        cardWidth,
        "Total Revenue",
        formatCurrency(details.totalRevenue),
        "#0f172a",
      );
      drawStatCard(
        leftX + cardWidth + cardGap,
        cardY,
        cardWidth,
        "Total Bookings",
        String(details.bookings.length),
        "#0f172a",
      );
      drawStatCard(
        leftX + (cardWidth + cardGap) * 2,
        cardY,
        cardWidth,
        "Avg. Booking Value",
        formatCurrency(
          details.bookings.length > 0
            ? details.totalRevenue / details.bookings.length
            : 0,
        ),
        "#15803d",
      );

      const columns = [
        { label: "#", width: 30 },
        { label: "Booking ID", width: 136 },
        { label: "Customer / Mobile", width: 170 },
        { label: "Date", width: 92 },
        { label: "Time", width: 112 },
        { label: "Amount", width: 88 },
        { label: "Status", width: 84 },
      ];

      const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
      const scale = tableWidth > pageWidth ? pageWidth / tableWidth : 1;
      const scaledColumns = columns.map((column) => ({
        ...column,
        width: column.width * scale,
      }));

      let y = cardY + 86;
      const headerHeight = 20;
      const rowHeight = 28;

      const ensureSpace = (height = rowHeight) => {
        if (y + height > document.page.height - document.page.margins.bottom) {
          document.addPage();
          y = document.page.margins.top;
        }
      };

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
            .fontSize(isHeader ? 8.5 : 8)
            .text(value, x + 6, y + (isHeader ? 5 : 6), {
              width: column.width - 12,
              ellipsis: true,
            });

          x += column.width;
        });

        y += isHeader ? headerHeight : rowHeight;
      };

      ensureSpace(headerHeight + 2);
      drawRow(
        columns.map((column) => column.label),
        true,
      );

      if (details.bookings.length === 0) {
        ensureSpace();
        drawRow(["-", "No bookings found", "-", "-", "-", "0.00", "-"]);
      } else {
        details.bookings.forEach((booking, index) => {
          ensureSpace();
          drawRow([
            String(index + 1),
            booking.id,
            `${booking.user.name ?? "Unknown"}\n${booking.user.mobileNumber ?? "Unknown"}`,
            booking.slot.slotDate,
            `${booking.slot.startTime} - ${booking.slot.endTime}`,
            Number(booking.slot.price).toFixed(2),
            booking.status,
          ]);
        });
      }

      y += 12;
      ensureSpace();
      document
        .fillColor("#475569")
        .font("Helvetica")
        .fontSize(9)
        .text(
          `Total bookings: ${details.bookings.length}    Total revenue: ${formatCurrency(details.totalRevenue)}`,
          leftX,
          y,
        );

      const signatureY = y + 34;
      if (
        signatureY + 42 >
        document.page.height - document.page.margins.bottom
      ) {
        document.addPage();
        y = document.page.margins.top;
      }

      const signatureLineY = signatureY;
      const signatureBlockWidth = 150;
      const signatureBlockX =
        document.page.width - document.page.margins.right - signatureBlockWidth;

      document
        .moveTo(signatureBlockX, signatureLineY)
        .lineTo(signatureBlockX + signatureBlockWidth, signatureLineY)
        .lineWidth(0.8)
        .strokeColor("#0f172a")
        .stroke();

      document
        .fillColor("#0f172a")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("Authorized Signature", signatureBlockX, signatureLineY + 8, {
          width: signatureBlockWidth,
          align: "center",
        });

      document
        .fillColor("#64748b")
        .font("Helvetica")
        .fontSize(8)
        .text("Admin / Owner", signatureBlockX, signatureLineY + 22, {
          width: signatureBlockWidth,
          align: "center",
        });

      document.end();
    });
  }
}
