import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Param,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  UseGuards,
  BadRequestException,
  ParseUUIDPipe,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Brackets } from "typeorm";
import { DateTime } from "luxon";
import {
  MembershipPlan,
  MembershipDaySchedule,
} from "./entities/membership-plan.entity";
import {
  CreateMembershipPlanDto,
  MembershipDayScheduleDto,
  MembershipTimeWindowDto,
} from "./dto/create-membership-plan.dto";
import { CancelMembershipPlanDto } from "./dto/cancel-membership-plan.dto";
import { UpgradeMembershipPriceDto } from "./dto/upgrade-membership-price.dto";
import { UpdateMembershipPlanDto } from "./dto/update-membership-plan.dto";
import { MembershipPricingHistory } from "./entities/membership-pricing-history.entity";
import { UserAccount } from "../auth/entities/user.entity";
import { Field } from "../fields/entities/field.entity";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { FieldsService } from "../fields/fields.service";
import { Booking } from "./entities/booking.entity";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { getMembershipTimeWindows } from "./membership-plan-schedule.utils";

@Controller("membership-plans")
export class MembershipPlanController {
  constructor(
    @InjectRepository(MembershipPlan)
    private readonly membershipPlanRepo: Repository<MembershipPlan>,
    @InjectRepository(UserAccount)
    private readonly userRepo: Repository<UserAccount>,
    @InjectRepository(Field)
    private readonly fieldRepo: Repository<Field>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotRepo: Repository<FieldSlot>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(MembershipPricingHistory)
    private readonly pricingHistoryRepo: Repository<MembershipPricingHistory>,
    private readonly fieldsService: FieldsService,
  ) {}

  /**
   * Parses time string to minutes for comparison
   */
  private parseTimeToMinutes(time: string): number {
    const [hoursText, minutesText] = time.trim().split(":");
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      throw new Error("Invalid time format");
    }

    return hours * 60 + minutes;
  }
  /**
   * Validates time window: endTime must be greater than startTime
   */
  private validateTimeWindow(startTime: string, endTime: string): void {
    const start = this.parseTimeToMinutes(startTime);
    const end = this.parseTimeToMinutes(endTime);

    if (end <= start) {
      throw new BadRequestException(
        `Invalid time window: end time (${endTime}) must be greater than start time (${startTime})`,
      );
    }
  }

  private validateMembershipScheduleWindows(
    membershipSchedules: MembershipDayScheduleDto[],
  ): void {
    for (const daySchedule of membershipSchedules) {
      for (const timeWindow of daySchedule.slots) {
        this.validateTimeWindow(timeWindow.startTime, timeWindow.endTime);
      }

      const slots = daySchedule.slots || [];
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const slot1 = slots[i];
          const slot2 = slots[j];

          if (
            !(
              slot1.endTime <= slot2.startTime ||
              slot2.endTime <= slot1.startTime
            )
          ) {
            throw new BadRequestException(
              `Overlapping time windows in ${daySchedule.day}: ${slot1.startTime}-${slot1.endTime} overlaps with ${slot2.startTime}-${slot2.endTime}`,
            );
          }
        }
      }
    }
  }

  private async ensureNoMembershipScheduleConflicts(
    manager: any,
    fieldId: string,
    membershipSchedules: MembershipDayScheduleDto[],
    excludePlanId?: string,
  ): Promise<void> {
    const existingPlans = await manager
      .getRepository(MembershipPlan)
      .createQueryBuilder("plan")
      .innerJoinAndSelect("plan.field", "field")
      .where("field.id = :fieldId", { fieldId })
      .andWhere("plan.active = :active", { active: true })
      .setLock("pessimistic_write")
      .getMany();

    for (const existingPlan of existingPlans) {
      if (excludePlanId && existingPlan.id === excludePlanId) {
        continue;
      }

      const existingDays = existingPlan.daysOfWeek as MembershipDaySchedule[];

      for (const newDaySchedule of membershipSchedules) {
        const existingForThisDay = existingDays.filter(
          (sch) => sch.day === newDaySchedule.day,
        );

        if (existingForThisDay.length === 0) continue;

        const newWindows = newDaySchedule.slots;

        for (const existingDaySchedule of existingForThisDay) {
          const existingWindows = getMembershipTimeWindows(existingDaySchedule);

          for (const newWindow of newWindows) {
            const newStart = this.parseTimeToMinutes(newWindow.startTime);
            const newEnd = this.parseTimeToMinutes(newWindow.endTime);

            for (const existingWindow of existingWindows) {
              const existingStart = this.parseTimeToMinutes(
                existingWindow.startTime,
              );
              const existingEnd = this.parseTimeToMinutes(
                existingWindow.endTime,
              );

              if (
                this.timeRangesOverlap(
                  newStart,
                  newEnd,
                  existingStart,
                  existingEnd,
                )
              ) {
                throw new ConflictException(
                  `Membership plan conflicts with existing plan on ${newDaySchedule.day} at ${existingWindow.startTime}-${existingWindow.endTime}. Please choose a different time range.`,
                );
              }
            }
          }
        }
      }
    }
  }

  private async syncMembershipSlots(
    manager: any,
    field: Field,
    membershipSchedules: MembershipDayScheduleDto[],
    membershipPlanId: string,
    userId: string,
    perSlotPrice: string,
    startDate: string,
  ): Promise<number> {
    const allSlots = await manager
      .getRepository(FieldSlot)
      .createQueryBuilder("slot")
      .where("slot.field_id = :fieldId", { fieldId: field.id })
      .andWhere("slot.status = :status", { status: "available" })
      .andWhere("slot.slot_date >= :startDate", { startDate })
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

    let syncedCount = 0;

    for (const slot of allSlots) {
      let slotDateObj: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(slot.slotDate)) {
        const [year, month, day] = slot.slotDate.split("-").map(Number);
        slotDateObj = new Date(year, month - 1, day);
      } else {
        slotDateObj = new Date(slot.slotDate);
      }

      const slotDayName = dayNames[slotDateObj.getDay()];
      const matchingDaySchedules = membershipSchedules.filter(
        (sch) => sch.day === slotDayName,
      );

      if (matchingDaySchedules.length === 0) {
        continue;
      }

      const slotStart = this.parseTimeToMinutes(slot.startTime);
      const slotEnd = this.parseTimeToMinutes(slot.endTime);

      let matchingDaySchedule: MembershipDayScheduleDto | null = null;
      let matchingTimeWindow: MembershipTimeWindowDto | null = null;

      for (const schedule of matchingDaySchedules) {
        for (const timeWindow of schedule.slots) {
          const scheduleStart = this.parseTimeToMinutes(timeWindow.startTime);
          const scheduleEnd = this.parseTimeToMinutes(timeWindow.endTime);

          if (slotStart === scheduleStart && slotEnd === scheduleEnd) {
            matchingDaySchedule = schedule;
            matchingTimeWindow = timeWindow;
            break;
          }
        }

        if (matchingDaySchedule) {
          break;
        }
      }

      if (!matchingDaySchedule || !matchingTimeWindow) {
        continue;
      }

      const lockedSlot = await manager
        .getRepository(FieldSlot)
        .createQueryBuilder("slot")
        .where("slot.id = :id", { id: slot.id })
        .setLock("pessimistic_write")
        .getOne();

      if (!lockedSlot || lockedSlot.status !== "available") continue;

      lockedSlot.status = "booked";
      lockedSlot.slotType = "membership";
      lockedSlot.price = perSlotPrice;
      lockedSlot.membershipPlanId = membershipPlanId;
      await manager.save(FieldSlot, lockedSlot);

      const booking = manager.create(Booking, {
        fieldId: field.id,
        slotId: lockedSlot.id,
        userId,
        status: "booked",
        totalAmount: "0",
        bookingType: "membership",
      });
      await manager.save(Booking, booking);
      syncedCount++;
    }

    return syncedCount;
  }

  private validateMembershipScheduleShape(
    membershipSchedules: MembershipDayScheduleDto[],
  ): void {
    const validDays = new Set([
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]);

    for (const [dayIndex, daySchedule] of membershipSchedules.entries()) {
      if (!daySchedule || typeof daySchedule !== "object") {
        throw new BadRequestException(
          `timeRange.${dayIndex} must be an object with day and slots`,
        );
      }

      if (!daySchedule.day || !validDays.has(daySchedule.day)) {
        throw new BadRequestException(
          `timeRange.${dayIndex}.day must be one of sunday, monday, tuesday, wednesday, thursday, friday, saturday`,
        );
      }

      if (!Array.isArray(daySchedule.slots) || daySchedule.slots.length === 0) {
        throw new BadRequestException(
          `timeRange.${dayIndex}.slots must be a non-empty array`,
        );
      }

      for (const [slotIndex, timeWindow] of daySchedule.slots.entries()) {
        if (!timeWindow || typeof timeWindow !== "object") {
          throw new BadRequestException(
            `timeRange.${dayIndex}.slots.${slotIndex} must be an object with startTime and endTime`,
          );
        }

        if (typeof timeWindow.startTime !== "string") {
          throw new BadRequestException(
            `timeRange.${dayIndex}.slots.${slotIndex}.startTime must be a string`,
          );
        }

        if (typeof timeWindow.endTime !== "string") {
          throw new BadRequestException(
            `timeRange.${dayIndex}.slots.${slotIndex}.endTime must be a string`,
          );
        }
      }
    }
  }

  private transformTimeRangeToStorageFormat(
    daySchedules: MembershipDayScheduleDto[],
  ): MembershipDaySchedule[] {
    // Store day schedules as plain day/time windows; plan-level fields carry price/date.
    return daySchedules.map((day) => {
      return {
        day: day.day,
        startTime: day.slots.map((s) => s.startTime),
        endTime: day.slots.map((s) => s.endTime),
      };
    });
  }

  /**
   * Checks if two time ranges overlap
   */
  private timeRangesOverlap(
    start1: number,
    end1: number,
    start2: number,
    end2: number,
  ): boolean {
    return (start1 < end2 && end1 > start2) || (start2 < end1 && end2 > start1);
  }

  @Patch(":id/upgrade-price")
  @UseGuards(JwtAuthGuard)
  async upgradeMembershipPrice(
    @Param("id", new ParseUUIDPipe()) membershipId: string,
    @Body() dto: UpgradeMembershipPriceDto,
    @CurrentAccount() currentUser: AuthenticatedAccount,
  ) {
    if (currentUser.role !== "admin") {
      throw new ForbiddenException("Only admins can upgrade membership prices");
    }

    return this.performPriceUpgrade(
      membershipId,
      dto.effectiveFromDate,
      dto.newPrice,
      currentUser,
    );
  }

  /**
   * Unified endpoint to update membership plan
   * Supports: cancellation (with endDate), price upgrade (with effectiveFromDate & newPrice), or slot updates (with timeRange)
   */
  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async updateMembershipPlan(
    @Param("id", new ParseUUIDPipe()) membershipId: string,
    @Body() dto: UpdateMembershipPlanDto,
    @CurrentAccount() currentUser: AuthenticatedAccount,
  ) {
    if (currentUser.role !== "admin") {
      throw new ForbiddenException("Only admins can update membership plans");
    }

    // Determine operation type based on provided fields
    const hasEndDate = dto.endDate !== undefined;
    const hasPriceUpgrade =
      dto.effectiveFromDate !== undefined && dto.newPrice !== undefined;
    const hasTimeRangeUpdate = dto.timeRange !== undefined;
    const hasBasicPlanUpdate =
      dto.userName !== undefined ||
      dto.phoneNumber !== undefined ||
      dto.fieldId !== undefined ||
      dto.perSlotPrice !== undefined ||
      dto.startDate !== undefined ||
      dto.active !== undefined;

    if (
      !hasEndDate &&
      !hasPriceUpgrade &&
      !hasTimeRangeUpdate &&
      !hasBasicPlanUpdate
    ) {
      throw new BadRequestException(
        "Must provide endDate (cancellation), effectiveFromDate+newPrice (price upgrade), timeRange (slot update), or membership fields to update",
      );
    }

    if (
      (hasEndDate && hasPriceUpgrade) ||
      (hasEndDate && hasTimeRangeUpdate) ||
      (hasPriceUpgrade && hasTimeRangeUpdate) ||
      (hasEndDate && hasBasicPlanUpdate) ||
      (hasPriceUpgrade && hasBasicPlanUpdate)
    ) {
      throw new BadRequestException(
        "Can only perform one cancellation or price-upgrade operation per request. Membership detail updates can be combined with slot updates.",
      );
    }

    // Execute cancellation if endDate provided
    if (hasEndDate) {
      return this.performMembershipCancellation(
        membershipId,
        dto.endDate!,
        currentUser,
      );
    }

    // Execute price upgrade if effectiveFromDate and newPrice provided
    if (hasPriceUpgrade) {
      return this.performPriceUpgrade(
        membershipId,
        dto.effectiveFromDate!,
        dto.newPrice!,
        currentUser,
      );
    }

    // Execute slot time update if timeRange provided
    if (hasTimeRangeUpdate) {
      return this.performSlotTimeUpdate(membershipId, dto, currentUser);
    }

    if (hasBasicPlanUpdate) {
      return this.performMembershipDetailUpdate(membershipId, dto, currentUser);
    }
  }

  /**
   * Helper method: Cancel membership with end date
   */
  private async performMembershipCancellation(
    membershipId: string,
    endDate: string,
    currentUser: AuthenticatedAccount,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cancelDate = new Date(endDate);
    cancelDate.setHours(0, 0, 0, 0);
    if (cancelDate < today) {
      throw new ConflictException("End date must be today or in the future");
    }

    return this.fieldSlotRepo.manager.transaction(async (manager) => {
      const membershipRepo = manager.getRepository(MembershipPlan);
      const bookingRepo = manager.getRepository(Booking);
      const slotRepo = manager.getRepository(FieldSlot);

      const membership = await membershipRepo
        .createQueryBuilder("plan")
        .innerJoinAndSelect("plan.field", "field")
        .where("plan.id = :id", { id: membershipId })
        .andWhere("field.owner_id = :ownerId", { ownerId: currentUser.id })
        .setLock("pessimistic_write")
        .getOne();

      if (!membership) {
        throw new NotFoundException("Membership plan not found");
      }

      if (!membership.active) {
        throw new ConflictException("Membership plan is already inactive");
      }

      // endDate is treated as the first inactive day, so cancel bookings on or after it.
      const firstInactiveDate = endDate;
      const membershipBookings = await bookingRepo
        .createQueryBuilder("booking")
        .innerJoinAndSelect("booking.slot", "slot")
        .where("slot.membership_plan_id = :planId", { planId: membershipId })
        .andWhere("booking.booking_type = :type", { type: "membership" })
        .andWhere("booking.status = :status", { status: "booked" })
        .andWhere("slot.slot_date >= :endDate", { endDate: firstInactiveDate })
        .getMany();

      for (const booking of membershipBookings) {
        booking.status = "cancelled";
        await bookingRepo.save(booking);

        booking.slot.status = "available";
        booking.slot.slotType = "normal";
        booking.slot.membershipPlanId = null;
        await slotRepo.save(booking.slot);
      }

      membership.active = false;
      membership.endDate = endDate;
      await membershipRepo.save(membership);

      return {
        operation: "cancelled",
        membershipPlan: {
          id: membership.id,
          active: membership.active,
          endDate: membership.endDate,
          perSlotPrice: membership.perSlotPrice,
          startDate: membership.startDate,
          userName: membership.userName,
          phoneNumber: membership.phoneNumber,
        },
        releasedBookings: membershipBookings.length,
        message: `Membership cancelled. ${membershipBookings.length} future bookings released.`,
      };
    });
  }

  /**
   * Helper method: Upgrade membership price from effective date
   */
  private async performPriceUpgrade(
    membershipId: string,
    effectiveFromDate: string,
    newPrice: number,
    currentUser: AuthenticatedAccount,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveDate = new Date(effectiveFromDate);
    effectiveDate.setHours(0, 0, 0, 0);
    if (effectiveDate < today) {
      throw new ConflictException(
        "Effective date must be today or in the future",
      );
    }

    const appliesImmediately = effectiveDate <= today;

    return this.fieldSlotRepo.manager.transaction(async (manager) => {
      const membershipRepo = manager.getRepository(MembershipPlan);
      const pricingRepo = manager.getRepository(MembershipPricingHistory);

      const membership = await membershipRepo
        .createQueryBuilder("plan")
        .innerJoinAndSelect("plan.field", "field")
        .where("plan.id = :id", { id: membershipId })
        .andWhere("field.owner_id = :ownerId", { ownerId: currentUser.id })
        .setLock("pessimistic_write")
        .getOne();

      if (!membership) {
        throw new NotFoundException("Membership plan not found");
      }

      if (!membership.active) {
        throw new ConflictException(
          "Cannot upgrade price for inactive membership",
        );
      }

      const existingPrice = await pricingRepo.findOne({
        where: {
          membershipPlanId: membershipId,
          effectiveFromDate: effectiveFromDate,
        },
      });

      if (existingPrice) {
        throw new ConflictException(
          `Price already exists for date ${effectiveFromDate}`,
        );
      }

      const pricingHistory = pricingRepo.create({
        membershipPlanId: membershipId,
        effectiveFromDate: effectiveFromDate,
        perSlotPrice: newPrice.toFixed(2),
      });

      await pricingRepo.save(pricingHistory);

      if (appliesImmediately) {
        membership.perSlotPrice = newPrice.toFixed(2);
      }
      await membershipRepo.save(membership);

      return {
        operation: "price_upgraded",
        appliedImmediately: appliesImmediately,
        membershipPlan: {
          id: membership.id,
          active: membership.active,
          perSlotPrice: membership.perSlotPrice,
          effectiveFromDate: effectiveFromDate,
        },
        message: appliesImmediately
          ? `Price upgraded to ${newPrice} effective from ${effectiveFromDate}`
          : `Price scheduled to upgrade to ${newPrice} effective from ${effectiveFromDate}`,
      };
    });
  }

  /**
   * Helper method: Update membership slot times (days and time windows)
   */
  private async performSlotTimeUpdate(
    membershipId: string,
    dto: UpdateMembershipPlanDto,
    currentUser: AuthenticatedAccount,
  ) {
    const newTimeRange = dto.timeRange ?? [];

    // Validate the new time range
    this.validateMembershipScheduleShape(newTimeRange);
    this.validateMembershipScheduleWindows(newTimeRange);

    return this.fieldSlotRepo.manager.transaction(async (manager) => {
      const membershipRepo = manager.getRepository(MembershipPlan);
      const bookingRepo = manager.getRepository(Booking);
      const slotRepo = manager.getRepository(FieldSlot);
      const fieldRepo = manager.getRepository(Field);

      const membership = await membershipRepo
        .createQueryBuilder("plan")
        .innerJoinAndSelect("plan.field", "field")
        .innerJoinAndSelect("plan.user", "user")
        .where("plan.id = :id", { id: membershipId })
        .andWhere("field.owner_id = :ownerId", { ownerId: currentUser.id })
        .setLock("pessimistic_write")
        .getOne();

      if (!membership) {
        throw new NotFoundException("Membership plan not found");
      }

      const willBeActive =
        dto.active !== undefined ? dto.active : membership.active;

      if (!willBeActive) {
        throw new ConflictException(
          "Cannot update slot times for inactive membership",
        );
      }

      if (dto.fieldId !== undefined) {
        const field = await fieldRepo.findOne({
          where: { id: dto.fieldId, ownerId: currentUser.id },
        });

        if (!field) {
          throw new NotFoundException(
            `Field with id ${dto.fieldId} not found or access denied`,
          );
        }

        membership.field = field;
      }

      if (newTimeRange.length > 0) {
        await this.ensureNoMembershipScheduleConflicts(
          manager,
          membership.field.id,
          newTimeRange,
          membership.id,
        );
      }

      if (dto.userName !== undefined) {
        membership.userName = dto.userName;
      }

      if (dto.phoneNumber !== undefined) {
        membership.phoneNumber = dto.phoneNumber;
      }

      if (dto.startDate !== undefined) {
        membership.startDate = dto.startDate;
      }

      if (dto.perSlotPrice !== undefined) {
        membership.perSlotPrice = dto.perSlotPrice.toFixed(2);
      }

      if (dto.active !== undefined) {
        membership.active = dto.active;
      }

      // Get old day schedules to find removed slots
      const oldSchedules = membership.daysOfWeek || [];
      const newSchedules = this.transformTimeRangeToStorageFormat(newTimeRange);

      // Find time slots that were removed (not in new schedule)
      const removedTimeWindows: {
        day: string;
        startTime: string;
        endTime: string;
      }[] = [];
      for (const oldDay of oldSchedules) {
        const newDay = newSchedules.find((d) => d.day === oldDay.day);
        const oldWindows = getMembershipTimeWindows(oldDay);
        const newWindows = newDay ? getMembershipTimeWindows(newDay) : [];

        if (!newDay) {
          // Entire day removed
          for (const slot of oldWindows) {
            removedTimeWindows.push({
              day: oldDay.day,
              startTime: slot.startTime,
              endTime: slot.endTime,
            });
          }
        } else {
          // Check for removed slots on this day
          for (const oldSlot of oldWindows) {
            const slotExists = newWindows.some(
              (s) =>
                s.startTime === oldSlot.startTime &&
                s.endTime === oldSlot.endTime,
            );
            if (!slotExists) {
              removedTimeWindows.push({
                day: oldDay.day,
                startTime: oldSlot.startTime,
                endTime: oldSlot.endTime,
              });
            }
          }
        }
      }

      // Cancel all future bookings for removed time slots
      let cancelledCount = 0;
      if (removedTimeWindows.length > 0) {
        // Get all future slots for this membership with the removed times
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayString = today.toISOString().split("T")[0];

        for (const removedWindow of removedTimeWindows) {
          const bookingsToRelease = await bookingRepo
            .createQueryBuilder("booking")
            .innerJoinAndSelect("booking.slot", "slot")
            .where("slot.membership_plan_id = :planId", {
              planId: membershipId,
            })
            .andWhere("slot.slot_date >= :today", { today: todayString })
            .andWhere("slot.start_time = :startTime", {
              startTime: removedWindow.startTime,
            })
            .andWhere("slot.end_time = :endTime", {
              endTime: removedWindow.endTime,
            })
            .getMany();

          for (const booking of bookingsToRelease) {
            if (booking.status === "booked") {
              booking.status = "cancelled";
              await bookingRepo.save(booking);
              cancelledCount++;
            }

            booking.slot.status = "available";
            booking.slot.slotType = "normal";
            booking.slot.membershipPlanId = null;
            await slotRepo.save(booking.slot);
          }
        }
      }

      // Update membership with new time range
      membership.daysOfWeek = newSchedules;
      await membershipRepo.save(membership);

      const syncedCount = await this.syncMembershipSlots(
        manager,
        membership.field,
        newTimeRange,
        membership.id,
        membership.user.id,
        membership.perSlotPrice,
        membership.startDate,
      );

      return {
        operation: "slot_times_updated",
        membershipPlan: {
          id: membership.id,
          active: membership.active,
          startDate: membership.startDate,
          userName: membership.userName,
          phoneNumber: membership.phoneNumber,
          perSlotPrice: membership.perSlotPrice,
          fieldId: membership.field.id,
          daysOfWeek: membership.daysOfWeek,
        },
        removedTimeSlots: removedTimeWindows.length,
        cancelledBookings: cancelledCount,
        syncedSlots: syncedCount,
        message: `Slot times updated. ${removedTimeWindows.length} time slots removed, ${cancelledCount} future bookings cancelled.`,
      };
    });
  }

  private async performMembershipDetailUpdate(
    membershipId: string,
    dto: UpdateMembershipPlanDto,
    currentUser: AuthenticatedAccount,
  ) {
    return this.fieldSlotRepo.manager.transaction(async (manager) => {
      const membershipRepo = manager.getRepository(MembershipPlan);
      const fieldRepo = manager.getRepository(Field);

      const membership = await membershipRepo
        .createQueryBuilder("plan")
        .innerJoinAndSelect("plan.field", "field")
        .where("plan.id = :id", { id: membershipId })
        .andWhere("field.owner_id = :ownerId", { ownerId: currentUser.id })
        .setLock("pessimistic_write")
        .getOne();

      if (!membership) {
        throw new NotFoundException("Membership plan not found");
      }

      if (dto.fieldId !== undefined) {
        const field = await fieldRepo.findOne({
          where: { id: dto.fieldId, ownerId: currentUser.id },
        });

        if (!field) {
          throw new NotFoundException(
            `Field with id ${dto.fieldId} not found or access denied`,
          );
        }

        membership.field = field;
      }

      if (dto.userName !== undefined) {
        membership.userName = dto.userName;
      }

      if (dto.phoneNumber !== undefined) {
        membership.phoneNumber = dto.phoneNumber;
      }

      if (dto.startDate !== undefined) {
        membership.startDate = dto.startDate;
      }

      if (dto.perSlotPrice !== undefined) {
        membership.perSlotPrice = dto.perSlotPrice.toFixed(2);
      }

      if (dto.active !== undefined) {
        membership.active = dto.active;
      }

      if (dto.timeRange !== undefined) {
        this.validateMembershipScheduleShape(dto.timeRange);
        membership.daysOfWeek = this.transformTimeRangeToStorageFormat(
          dto.timeRange,
        );
      }

      await membershipRepo.save(membership);

      return {
        operation: "membership_updated",
        membershipPlan: {
          id: membership.id,
          active: membership.active,
          startDate: membership.startDate,
          userName: membership.userName,
          phoneNumber: membership.phoneNumber,
          perSlotPrice: membership.perSlotPrice,
          fieldId: membership.field.id,
          daysOfWeek: membership.daysOfWeek,
        },
        message: "Membership plan updated successfully.",
      };
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createMembershipPlan(
    @Body() dto: CreateMembershipPlanDto,
    @CurrentAccount() currentUser: AuthenticatedAccount,
  ) {
    const membershipSchedules = dto.timeRange;
    this.validateMembershipScheduleShape(membershipSchedules);

    // Verify field ownership before proceeding
    const field = await this.fieldRepo.findOne({
      where: { id: dto.fieldId, ownerId: currentUser.id },
    });

    if (!field) {
      throw new NotFoundException(
        `Field with id ${dto.fieldId} not found or access denied`,
      );
    }

    this.validateMembershipScheduleWindows(membershipSchedules);

    // Find or create user by phone number
    let user = await this.userRepo.findOne({
      where: { mobileNumber: dto.phoneNumber },
    });
    if (!user) {
      user = this.userRepo.create({
        name: dto.userName,
        mobileNumber: dto.phoneNumber,
        passwordHash: null,
      });
      user = await this.userRepo.save(user);
    } else if (!user.name) {
      user.name = dto.userName;
      user = await this.userRepo.save(user);
    }

    // Conflict-check, plan save, and slot sync must be run atomically within a transaction
    return await this.membershipPlanRepo.manager.transaction(
      async (manager) => {
        await this.ensureNoMembershipScheduleConflicts(
          manager,
          field.id,
          membershipSchedules,
        );

        // Transform new nested format into storage format.
        const daysWithStrings =
          this.transformTimeRangeToStorageFormat(membershipSchedules);

        const plan = manager.create(MembershipPlan, {
          user,
          field,
          daysOfWeek: daysWithStrings as unknown as MembershipDaySchedule[],
          startDate: dto.startDate,
          active: dto.active ?? true,
          userName: dto.userName,
          phoneNumber: dto.phoneNumber,
          perSlotPrice: dto.perSlotPrice.toFixed(2),
        });
        const savedPlan = await manager.save(plan);

        const syncedCount = savedPlan.active
          ? await this.syncMembershipSlots(
              manager,
              field,
              membershipSchedules,
              savedPlan.id,
              user!.id,
              dto.perSlotPrice.toFixed(2),
              dto.startDate,
            )
          : 0;

        return {
          success: true,
          plan: {
            ...savedPlan,
          },
          syncedSlots: syncedCount,
        };
      },
    );
  }

  @Get(":id/played-slots")
  @UseGuards(JwtAuthGuard)
  async getPlayedSlots(
    @Param("id") planId: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const plan = await this.membershipPlanRepo.findOne({
      where: { id: planId },
      relations: ["field", "user"],
    });

    if (!plan || !plan.field || !plan.user) {
      throw new NotFoundException("Membership plan not found");
    }

    // allow plan owner or the member themselves to view played slots
    if (account.id !== plan.field.ownerId && account.id !== plan.user.id) {
      throw new ForbiddenException("Not authorized to view this membership");
    }

    return await this.membershipPlanRepo.manager.transaction(
      async (manager) => {
        const now = DateTime.now().setZone("Asia/Kathmandu");
        const today = now.toISODate();
        const nowTime = now.toFormat("HH:mm:ss");

        // Fetch played slots
        const bookings = await manager
          .getRepository(Booking)
          .createQueryBuilder("booking")
          .innerJoinAndSelect("booking.slot", "slot")
          .where("booking.user_id = :userId", { userId: plan.user.id })
          .andWhere("booking.booking_type = :type", { type: "membership" })
          .andWhere("slot.membership_plan_id = :planId", { planId: plan.id })
          .andWhere(
            new Brackets((qb) => {
              qb.where("slot.slot_date < :today", { today }).orWhere(
                "slot.slot_date = :today AND slot.start_time < :nowTime",
                { today, nowTime },
              );
            }),
          )
          .orderBy("slot.slot_date", "DESC")
          .addOrderBy("slot.start_time", "DESC")
          .getMany();

        // Calculate total amount from played slots (using slot's current price)
        const totalAmount = bookings.reduce((sum, booking) => {
          return (
            sum +
            Number(
              booking.slot.price ||
                booking.totalAmount ||
                booking.baseAmount ||
                0,
            )
          );
        }, 0);

        // Update membership plan with total amount
        const updatedPlan = await manager
          .getRepository(MembershipPlan)
          .findOne({
            where: { id: planId },
          });

        if (updatedPlan) {
          updatedPlan.totalAmount = totalAmount.toFixed(2);

          // Calculate and save payment breakdown
          const paidAmountNum = Number(updatedPlan.paidAmount || 0);
          const dueAmount = Math.max(0, totalAmount - paidAmountNum);
          const extraPaidAmount = Math.max(0, paidAmountNum - totalAmount);

          updatedPlan.dueAmount = dueAmount.toFixed(2);
          updatedPlan.extraPaidAmount = extraPaidAmount.toFixed(2);

          await manager.save(updatedPlan);
        }

        // Map to response format (use slot's current price for totalAmount)
        const playedSlots = bookings.map((b) => ({
          bookingId: b.id,
          slotId: b.slotId,
          slotDate: b.slot.slotDate,
          startTime: b.slot.startTime,
          endTime: b.slot.endTime,
          bookingStatus: b.status,
          bookingType: b.bookingType,
          baseAmount: b.baseAmount,
          totalAmount: b.slot.price,
        }));

        return {
          plan: {
            id: updatedPlan?.id,
            userName: updatedPlan?.userName,
            totalAmount: updatedPlan?.totalAmount,
            paidAmount: updatedPlan?.paidAmount,
            dueAmount: updatedPlan?.dueAmount,
            extraPaidAmount: updatedPlan?.extraPaidAmount,
          },
          playedSlots,
          summary: {
            totalSlots: bookings.length,
            totalAmount: updatedPlan?.totalAmount,
            paidAmount: updatedPlan?.paidAmount,
            dueAmount: updatedPlan?.dueAmount,
            extraPaidAmount: updatedPlan?.extraPaidAmount,
          },
        };
      },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("by-field/:fieldId")
  getMembershipDetailsByField(
    @Param("fieldId") fieldId: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    return this.fieldsService.getFieldSlotSummary(fieldId, account.id);
  }

  /**
   * Record payment for a membership plan
   * Reduces totalDueAmount by the paid amount
   */
  @Patch(":id/record-payment")
  @UseGuards(JwtAuthGuard)
  async recordPayment(
    @Param("id") planId: string,
    @Body() payload: { amount: number },
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    // Validate amount as numeric
    const amount = Number(payload?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        "Payment amount must be a finite number > 0",
      );
    }

    // Run transactional update with pessimistic lock to avoid races
    return await this.membershipPlanRepo.manager.transaction(
      async (manager) => {
        const planRepo = manager.getRepository(MembershipPlan);

        // Lock only the plan row. Avoid joining relations in the locking query
        // because Postgres rejects FOR UPDATE on the nullable side of outer joins.
        const lockedPlan = await planRepo
          .createQueryBuilder("plan")
          .where("plan.id = :id", { id: planId })
          .setLock("pessimistic_write")
          .getOne();

        if (!lockedPlan) {
          throw new NotFoundException(
            `Membership plan not found for id ${planId}. Please use the exact membership plan id from the database.`,
          );
        }

        const planWithRelations = await planRepo.findOne({
          where: { id: planId },
          relations: ["field", "user"],
        });

        if (!planWithRelations?.field || !planWithRelations.user) {
          throw new NotFoundException(
            `Membership plan not found for id ${planId}. Please use the exact membership plan id from the database.`,
          );
        }

        // Authorize: field owner or membership holder can record payment
        const isFieldOwner = account.id === planWithRelations.field.ownerId;
        const isMembershipHolder = account.id === planWithRelations.user.id;
        if (!isFieldOwner && !isMembershipHolder) {
          throw new ForbiddenException(
            "Only field owner or membership holder can record payment",
          );
        }

        // Atomically increment paid_amount in DB
        await manager
          .createQueryBuilder()
          .update(MembershipPlan)
          .set({ paidAmount: () => `paid_amount + ${amount}` })
          .where("id = :id", { id: planId })
          .execute();

        // Reload updated plan
        const updatedPlan = await planRepo.findOne({ where: { id: planId } });
        if (!updatedPlan) {
          throw new NotFoundException("Membership plan not found after update");
        }

        // Compute numeric breakdown
        const currentTotal = Number(updatedPlan.totalAmount || 0);
        const paidNum = Number(updatedPlan.paidAmount || 0);
        const dueAmount = Math.max(0, currentTotal - paidNum);
        const extraPaidAmount = Math.max(0, paidNum - currentTotal);

        updatedPlan.dueAmount = dueAmount.toFixed(2);
        updatedPlan.extraPaidAmount = extraPaidAmount.toFixed(2);

        await planRepo.save(updatedPlan);

        return {
          success: true,
          plan: {
            id: updatedPlan.id,
            userName: updatedPlan.userName,
            totalAmount: updatedPlan.totalAmount,
            paidAmount: updatedPlan.paidAmount,
            dueAmount: updatedPlan.dueAmount,
            extraPaidAmount: updatedPlan.extraPaidAmount,
          },
          message: `Payment of ${amount} recorded. Remaining due: ${updatedPlan.dueAmount}`,
        };
      },
    );
  }
}
