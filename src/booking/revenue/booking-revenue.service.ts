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
      const document = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];

      document.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);

      document.fontSize(20).text("Monthly Booking Report", { align: "center" });
      document.moveDown(0.75);
      document
        .fontSize(12)
        .text(`${details.fieldName} - ${details.courtName}`, {
          align: "center",
        });
      document.moveDown(0.4);

      if (details.dateRange) {
        document
          .fontSize(11)
          .text(
            `Period: ${details.dateRange.startDate} to ${details.dateRange.endDate}`,
            { align: "center" },
          );
        document.moveDown(0.5);
      }

      document
        .fontSize(12)
        .text(`Total completed revenue: ${details.totalRevenue.toFixed(2)}`, {
          align: "center",
        });
      document.moveDown(1);

      const columns = [
        { label: "#", width: 25 },
        { label: "Booking ID", width: 105 },
        { label: "Customer", width: 95 },
        { label: "Mobile", width: 75 },
        { label: "Date", width: 65 },
        { label: "Time", width: 75 },
        { label: "Amount", width: 55 },
      ];

      const startX = document.page.margins.left;
      const pageWidth =
        document.page.width -
        document.page.margins.left -
        document.page.margins.right;
      const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
      const scale = tableWidth > pageWidth ? pageWidth / tableWidth : 1;
      const scaledColumns = columns.map((column) => ({
        ...column,
        width: column.width * scale,
      }));

      let y = document.y;
      const rowHeight = 22;

      const drawRow = (values: string[], isHeader = false) => {
        let x = startX;
        values.forEach((value, index) => {
          const column = scaledColumns[index];
          document.rect(x, y, column.width, rowHeight).stroke();
          document.fontSize(isHeader ? 9 : 8).text(value, x + 4, y + 6, {
            width: column.width - 8,
            ellipsis: true,
          });
          x += column.width;
        });
        y += rowHeight;
      };

      const ensureSpace = () => {
        if (
          y + rowHeight >
          document.page.height - document.page.margins.bottom
        ) {
          document.addPage();
          y = document.page.margins.top;
        }
      };

      ensureSpace();
      drawRow(
        columns.map((column) => column.label),
        true,
      );

      if (details.bookings.length === 0) {
        ensureSpace();
        drawRow(["-", "No bookings found", "-", "-", "-", "-", "0.00"]);
      } else {
        details.bookings.forEach((booking, index) => {
          ensureSpace();
          drawRow([
            String(index + 1),
            booking.id,
            booking.user.name ?? "Unknown",
            booking.user.mobileNumber ?? "Unknown",
            booking.slot.slotDate,
            `${booking.slot.startTime} - ${booking.slot.endTime}`,
            Number(booking.slot.price).toFixed(2),
          ]);
        });
      }

      y += 12;
      ensureSpace();
      document
        .fontSize(11)
        .text(`Total bookings: ${details.bookings.length}`, startX, y);

      document.end();
    });
  }
}
