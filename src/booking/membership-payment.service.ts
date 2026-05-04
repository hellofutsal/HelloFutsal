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
import {
  MembershipPlan,
  MembershipDaySchedule,
} from "./entities/membership-plan.entity";
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

    return await this.membershipPaymentRepo.manager.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(MembershipPayment);
        const bookingRepo = manager.getRepository(Booking);
        const slotRepo = manager.getRepository(FieldSlot);

        let periodStartDate = dto.periodStartDate;

        if (!periodStartDate) {
          // Check if there's an existing payment for this plan
          const latestPayment = await paymentRepo.findOne({
            where: { membershipPlanId: plan.id },
            order: { periodEndDate: "DESC" },
          });

          if (latestPayment) {
            // Use the end date of the last payment as the start date for the new window
            periodStartDate = latestPayment.periodEndDate;
          } else {
            // No previous payment, use the plan's start date
            periodStartDate = plan.startDate;
          }
        }

        const periodStart = DateTime.fromISO(periodStartDate, {
          zone: "Asia/Kathmandu",
        });
        if (!periodStart.isValid) {
          throw new BadRequestException("periodStartDate must be a valid date");
        }

        const periodEndDate = periodStart.plus({ months: 1 }).toISODate();
        if (!periodEndDate) {
          throw new BadRequestException("Unable to calculate one-month period");
        }

        const dayNames = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ];

        if (dto.slotId) {
          const slot = await slotRepo.findOne({
            where: {
              id: dto.slotId,
              fieldId: plan.field.id,
            },
          });

          if (!slot) {
            throw new NotFoundException("Membership slot not found");
          }

          const booking = await bookingRepo.findOne({
            where: {
              slotId: slot.id,
              userId: plan.user.id,
            },
          });

          if (!booking || booking.bookingType !== "membership") {
            throw new BadRequestException(
              "No membership booking found for the provided slot",
            );
          }

          const lockedSlot = await slotRepo
            .createQueryBuilder("slot")
            .where("slot.id = :slotId", { slotId: slot.id })
            .setLock("pessimistic_write")
            .getOne();

          const lockedBooking = await bookingRepo
            .createQueryBuilder("booking")
            .where("booking.slot_id = :slotId", { slotId: slot.id })
            .andWhere("booking.user_id = :userId", { userId: plan.user.id })
            .setLock("pessimistic_write")
            .getOne();

          if (!lockedSlot || !lockedBooking) {
            throw new NotFoundException("Membership slot not found");
          }

          if (lockedBooking.status === "completed") {
            throw new ConflictException("Membership slot is already paid");
          }

          lockedBooking.status = "completed";
          lockedBooking.bookingType = "membership";
          lockedBooking.totalAmount = plan.perSlotPrice;

          lockedSlot.status = "completed";
          lockedSlot.slotType = "membership";
          lockedSlot.price = plan.perSlotPrice;
          lockedSlot.membershipPlanId = plan.id;

          await bookingRepo.save(lockedBooking);
          await slotRepo.save(lockedSlot);

          const payment = paymentRepo.create({
            membershipPlanId: plan.id,
            fieldId: plan.field.id,
            userId: plan.user.id,
            slotId: lockedSlot.id,
            periodStartDate: lockedSlot.slotDate,
            periodEndDate: lockedSlot.slotDate,
            paymentStatus: "paid",
            totalAmount: Number(plan.perSlotPrice).toFixed(2),
            confirmedSlotIds: [lockedSlot.id],
            confirmedBookingIds: [lockedBooking.id],
            confirmedCount: 1,
            paidAt: new Date(),
          });

          const saved = await paymentRepo.save(payment);

          return {
            success: true,
            payment: saved,
            confirmedCount: 1,
          };
        }

        const periodSlots = await slotRepo
          .createQueryBuilder("slot")
          .where("slot.field_id = :fieldId", { fieldId: plan.field.id })
          .andWhere("slot.slot_date >= :periodStartDate", { periodStartDate })
          .andWhere("slot.slot_date < :periodEndDate", { periodEndDate })
          .getMany();

        const planSchedules = (plan.daysOfWeek ||
          []) as MembershipDaySchedule[];
        const matchedSlotIds: string[] = [];
        const matchedBookingIds: string[] = [];

        for (const slot of periodSlots) {
          const booking = await bookingRepo.findOne({
            where: { slotId: slot.id, userId: plan.user.id },
          });
          if (!booking) continue;

          if (
            booking.bookingType === "membership" &&
            booking.status === "booked"
          ) {
            booking.status = "completed";
            booking.totalAmount = plan.perSlotPrice;
            await bookingRepo.save(booking);

            slot.membershipPlanId = plan.id;
            slot.status = "completed";
            slot.slotType = "membership";
            slot.price = plan.perSlotPrice;
            await slotRepo.save(slot);

            matchedSlotIds.push(slot.id);
            matchedBookingIds.push(booking.id);
          }
        }

        if (matchedSlotIds.length === 0) {
          throw new BadRequestException(
            "No membership bookings found in the monthly window for the selected plan",
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
