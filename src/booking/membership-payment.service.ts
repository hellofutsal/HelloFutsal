import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DateTime } from "luxon";
import { Repository } from "typeorm";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { Booking } from "./entities/booking.entity";
import { MembershipPlan } from "./entities/membership-plan.entity";
import { MembershipPayment } from "./entities/membership-payment.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { getMembershipTimeWindows } from "./membership-plan-schedule.utils";
import { CreateMembershipPaymentDto } from "./dto/create-membership-payment.dto";

@Injectable()
export class MembershipPaymentService {
  constructor(
    @InjectRepository(MembershipPayment)
    private readonly membershipPaymentRepo: Repository<MembershipPayment>,
    @InjectRepository(MembershipPlan)
    private readonly membershipPlanRepo: Repository<MembershipPlan>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotRepo: Repository<FieldSlot>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  async confirmMonthlyPayment(
    account: AuthenticatedAccount,
    dto: CreateMembershipPaymentDto,
  ) {
    const plan = await this.membershipPlanRepo.findOne({
      where: { id: dto.membershipPlanId },
      relations: ["field", "user"],
    });

    if (!plan || !plan.field || !plan.user) {
      throw new NotFoundException("Membership plan not found");
    }

    // allow plan owner (field owner) or the member themselves to confirm payment
    if (account.id !== plan.field.ownerId && account.id !== plan.user.id) {
      throw new ForbiddenException("Not authorized to confirm this payment");
    }

    const periodStartDate = dto.periodStartDate ?? plan.startDate;
    const periodStart = DateTime.fromISO(periodStartDate, {
      zone: "Asia/Kathmandu",
    });
    if (!periodStart.isValid) {
      throw new BadRequestException("periodStartDate must be a valid date");
    }

    const periodEndDate = periodStart
      .plus({ months: 1 })
      .minus({ days: 1 })
      .toISODate();
    if (!periodEndDate) {
      throw new BadRequestException("Unable to calculate one-month period");
    }

    return await this.membershipPaymentRepo.manager.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(MembershipPayment);
        const bookingRepo = manager.getRepository(Booking);
        const slotRepo = manager.getRepository(FieldSlot);

        // load candidate slots in period for the field
        const periodSlots = await slotRepo
          .createQueryBuilder("slot")
          .where("slot.field_id = :fieldId", { fieldId: plan.field.id })
          .andWhere("slot.slot_date >= :periodStartDate", { periodStartDate })
          .andWhere("slot.slot_date <= :periodEndDate", { periodEndDate })
          .getMany();

        const dayNames = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ];

        const planSchedules = (plan.daysOfWeek || []) as any[];
        const matchedSlotIds: string[] = [];
        const matchedBookingIds: string[] = [];

        for (const slot of periodSlots) {
          const slotDayName = this.getDayName(slot.slotDate, dayNames);
          const matchingSchedules = planSchedules.filter(
            (s) => s.day === slotDayName,
          );
          if (matchingSchedules.length === 0) continue;

          const match = matchingSchedules.find((schedule) =>
            getMembershipTimeWindows(schedule).some(
              (w) =>
                w.startTime === slot.startTime && w.endTime === slot.endTime,
            ),
          );
          if (!match) continue;

          // find booking for this slot for the member
          const booking = await bookingRepo.findOne({
            where: { slotId: slot.id, userId: plan.user.id },
          });
          if (!booking) continue;

          // only update membership bookings that are still 'booked'
          if (
            booking.bookingType === "membership" &&
            booking.status === "booked"
          ) {
            booking.status = "completed";
            await bookingRepo.save(booking);

            slot.membershipPlanId = plan.id;
            await slotRepo.save(slot);

            matchedSlotIds.push(slot.id);
            matchedBookingIds.push(booking.id);
          }
        }

        if (matchedSlotIds.length === 0) {
          throw new BadRequestException(
            "No membership bookings found to confirm in the selected period",
          );
        }

        const totalAmount = (
          matchedSlotIds.length * Number(plan.perSlotPrice)
        ).toFixed(2);

        const payment = paymentRepo.create({
          membershipPlanId: plan.id,
          fieldId: plan.field.id,
          userId: plan.user.id,
          periodStartDate,
          periodEndDate,
          paymentStatus: "paid",
          totalAmount,
          confirmedSlotIds: matchedSlotIds,
          confirmedBookingIds: matchedBookingIds,
          confirmedCount: matchedSlotIds.length,
          paidAt: new Date(),
        });

        const saved = await paymentRepo.save(payment);

        return {
          success: true,
          payment: saved,
          confirmedCount: matchedSlotIds.length,
        };
      },
    );
  }

  private getDayName(slotDate: string, dayNames: string[]): string {
    let dateObj: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
      const [year, month, day] = slotDate.split("-").map(Number);
      dateObj = new Date(year, month - 1, day);
    } else {
      dateObj = new Date(slotDate);
    }

    return dayNames[dateObj.getDay()];
  }
}
