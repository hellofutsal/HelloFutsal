import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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

  private ensureAdmin(account: AuthenticatedAccount): void {
    if (account.role !== "admin") {
      throw new ForbiddenException("Only admins can view revenue");
    }
  }
}
