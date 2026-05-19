import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DateTime } from "luxon";
import { TournamentBooking } from "./entities/tournament-booking.entity";
import { TournamentPayment } from "./entities/tournament-payment.entity";
import { CreateTournamentBookingDto } from "./dto/create-tournament-booking.dto";
import { UpdateTournamentBookingDto } from "./dto/update-tournament-booking.dto";
import { FieldSlot } from "../fields/entities/field-slot.entity";
import { Field } from "../fields/entities/field.entity";
import { FieldRuleBookHistory } from "../fields/entities/field-rule-book-history.entity";
import { FieldSlotGenerator } from "../fields/cron/field-slot-generator";
import { UserAccount } from "../auth/entities/user.entity";
import { Booking } from "../booking/entities/booking.entity";

@Injectable()
export class TournamentService {
  private static readonly bookingTimeZone = "Asia/Kathmandu";

  constructor(
    @InjectRepository(TournamentBooking)
    private readonly repo: Repository<TournamentBooking>,
    @InjectRepository(TournamentPayment)
    private readonly paymentRepo: Repository<TournamentPayment>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotRepo: Repository<FieldSlot>,
    @InjectRepository(UserAccount)
    private readonly userRepo: Repository<UserAccount>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  list() {
    return this.repo.find({ order: { startAt: "ASC" } });
  }

  async create(dto: CreateTournamentBookingDto) {
    const window = this.resolveTournamentWindow(dto);

    const ent = this.repo.create({
      fieldId: dto.courts[0] ?? null,
      organizerName: dto.organizerName,
      organizerPhone: dto.organizerPhone,
      eventName: dto.eventName,
      startAt: window.startDateTime.toJSDate(),
      endAt: window.endDateTime.toJSDate(),
      courts: dto.courts,
      totalAmount: dto.totalAmount,
      advancePaid: dto.advancePaid ?? "0",
      notes: dto.notes,
      status: "confirmed",
    });

    // Reserve matching field slots within the time range for selected courts
    return this.repo.manager.transaction(async (em) => {
      const saved = await em.getRepository(TournamentBooking).save(ent);

      const expectedSlotWindows = await this.buildExpectedTournamentSlotWindows(
        em.getRepository(FieldSlot),
        dto.courts,
        window.startDateStr,
        window.endDateStr,
        window.startTimeStr,
        window.endTimeStr,
      );

      const slots: FieldSlot[] = [];
      const missingWindows: string[] = [];

      for (const expectedSlot of expectedSlotWindows) {
        const slot = await em
          .getRepository(FieldSlot)
          .createQueryBuilder("slot")
          .setLock("pessimistic_write")
          .where("slot.field_id = :fieldId", { fieldId: expectedSlot.fieldId })
          .andWhere("slot.slot_date = :slotDate", {
            slotDate: expectedSlot.slotDate,
          })
          .andWhere("slot.start_time = :startTime", {
            startTime: expectedSlot.startTime,
          })
          .andWhere("slot.end_time = :endTime", {
            endTime: expectedSlot.endTime,
          })
          .getOne();

        if (!slot) {
          missingWindows.push(
            `${expectedSlot.fieldId} ${expectedSlot.slotDate} ${expectedSlot.startTime}-${expectedSlot.endTime}`,
          );
          continue;
        }

        if (slot.status !== "available") {
          throw new ConflictException(
            `Slot already occupied for ${slot.fieldId} on ${slot.slotDate} ${slot.startTime}-${slot.endTime}`,
          );
        }

        slots.push(slot);
      }

      if (missingWindows.length > 0) {
        throw new ConflictException(
          `No exact slots found for: ${missingWindows.join(", ")}`,
        );
      }

      const computedTotalAmount = this.sumAmounts(
        slots.map((slot) => slot.price),
      );

      // If caller supplied a totalAmount in DTO, use that as the tournament total
      // and divide it equally across the reserved slots. Otherwise fall back to
      // the computed sum of slot prices.
      const finalTotalAmount = dto.totalAmount ?? computedTotalAmount;
      saved.totalAmount = finalTotalAmount;
      await em.getRepository(TournamentBooking).save(saved);

      const perSlotAmount = slots.length
        ? (Number(finalTotalAmount) / slots.length).toFixed(2)
        : "0.00";

      // create or find organizer user
      let organizerUser: UserAccount | null = null;
      if (dto.organizerPhone) {
        organizerUser = await em
          .getRepository(UserAccount)
          .createQueryBuilder("user")
          .where("user.mobile_number = :mobileNumber", {
            mobileNumber: dto.organizerPhone,
          })
          .setLock("pessimistic_write")
          .getOne();
      }

      if (!organizerUser) {
        const userRepo = em.getRepository(UserAccount);
        const createUser = userRepo.create();
        createUser.name = dto.organizerName;
        createUser.mobileNumber = dto.organizerPhone;
        createUser.passwordHash = null;
        try {
          organizerUser = await userRepo.save(createUser);
        } catch (err) {
          // race: try to fetch existing by phone
          if (dto.organizerPhone) {
            organizerUser = await userRepo
              .createQueryBuilder("user")
              .where("user.mobile_number = :mobileNumber", {
                mobileNumber: dto.organizerPhone,
              })
              .getOne();
          }
          if (!organizerUser) throw err;
        }
      }

      if (!organizerUser) {
        throw new Error("Unable to resolve organizer user");
      }

      const bookingRepository = em.getRepository(Booking);

      for (const s of slots) {
        const slotAmount = this.sumAmounts([s.price]);

        // mark slot as tournament-type and booked for the selected window
        s.slotType = "tournament" as any;
        s.status = "booked" as any;
        // assign tournament booking id
        // @ts-ignore
        s.tournamentBookingId = saved.id;

        // Preserve original price for fast restore, then override the
        // per-slot price to be the equal share of the tournament total.
        // @ts-ignore
        s.previousPrice = s.price;
        s.price = perSlotAmount;

        await em.getRepository(FieldSlot).save(s);

        // create booking row pointing to organizer user
        await bookingRepository.save(
          bookingRepository.create({
            fieldId: s.fieldId,
            slotId: s.id,
            userId: organizerUser.id,
            status: "tournament",
            bookingType: "tournament",
            baseAmount: perSlotAmount,
            totalAmount: perSlotAmount,
          }),
        );
      }

      // Record advance payment as a TournamentPayment if provided
      if (Number(saved.advancePaid || 0) > 0) {
        const paymentRepo = em.getRepository(TournamentPayment);
        const advancePayment = paymentRepo.create({
          tournamentId: saved.id,
          amount: saved.advancePaid,
          method: "cash",
          note: "Advance payment on tournament creation",
        });
        await paymentRepo.save(advancePayment);
      }

      return saved;
    });
  }

  private async buildExpectedTournamentSlotWindows(
    fieldSlotRepo: Repository<FieldSlot>,
    fieldIds: string[],
    startDateStr: string,
    endDateStr: string,
    startTimeStr: string,
    endTimeStr: string,
  ): Promise<
    Array<{
      fieldId: string;
      slotDate: string;
      startTime: string;
      endTime: string;
    }>
  > {
    const sampleSlot = await fieldSlotRepo
      .createQueryBuilder("slot")
      .where("slot.field_id IN (:...fields)", { fields: fieldIds })
      .orderBy("slot.slot_date", "ASC")
      .addOrderBy("slot.start_time", "ASC")
      .getOne();

    if (!sampleSlot) {
      throw new ConflictException(
        `No field slots found for field(s) ${fieldIds.join(", ")} between ${startDateStr} ${startTimeStr} and ${endDateStr} ${endTimeStr}`,
      );
    }

    const slotDurationMinutes = this.minutesBetween(
      sampleSlot.startTime,
      sampleSlot.endTime,
    );

    if (slotDurationMinutes <= 0) {
      throw new BadRequestException("Invalid slot duration detected");
    }

    const startDateTime = DateTime.fromISO(startDateStr, {
      zone: TournamentService.bookingTimeZone,
    }).startOf("day");
    const endDateTime = DateTime.fromISO(endDateStr, {
      zone: TournamentService.bookingTimeZone,
    }).startOf("day");
    const startMinutes = FieldSlotGenerator.parseTimeToMinutes(startTimeStr);
    const endMinutes = FieldSlotGenerator.parseTimeToMinutes(endTimeStr);

    if (endMinutes <= startMinutes) {
      throw new BadRequestException(
        "endTime must be after startTime for tournament booking",
      );
    }

    const windows: Array<{
      fieldId: string;
      slotDate: string;
      startTime: string;
      endTime: string;
    }> = [];

    for (
      let cursorDate = startDateTime;
      cursorDate <= endDateTime;
      cursorDate = cursorDate.plus({ days: 1 })
    ) {
      const slotDate = cursorDate.toFormat("yyyy-MM-dd");

      for (
        let cursorMinutes = startMinutes;
        cursorMinutes + slotDurationMinutes <= endMinutes;
        cursorMinutes += slotDurationMinutes
      ) {
        const windowStart =
          FieldSlotGenerator.formatMinutesToTime(cursorMinutes);
        const windowEnd = FieldSlotGenerator.formatMinutesToTime(
          cursorMinutes + slotDurationMinutes,
        );

        for (const fieldId of fieldIds) {
          windows.push({
            fieldId,
            slotDate,
            startTime: windowStart,
            endTime: windowEnd,
          });
        }
      }
    }

    return windows;
  }

  private minutesBetween(startTime: string, endTime: string): number {
    return (
      FieldSlotGenerator.parseTimeToMinutes(endTime) -
      FieldSlotGenerator.parseTimeToMinutes(startTime)
    );
  }

  private sumAmounts(values: Array<string | number>): string {
    const total = values.reduce<number>(
      (sum, value) => sum + Number(value || 0),
      0,
    );
    return total.toFixed(2);
  }

  private resolveTournamentWindow(dto: CreateTournamentBookingDto) {
    if (dto.startDate && dto.endDate && dto.startTime && dto.endTime) {
      const startTime = this.normalizeTime(dto.startTime);
      const endTime = this.normalizeTime(dto.endTime);
      const startDateTime = DateTime.fromISO(`${dto.startDate}T${startTime}`, {
        zone: TournamentService.bookingTimeZone,
      });
      const endDateTime = DateTime.fromISO(`${dto.endDate}T${endTime}`, {
        zone: TournamentService.bookingTimeZone,
      });

      if (endDateTime < startDateTime) {
        throw new BadRequestException(
          "endDate/endTime must be after startDate/startTime",
        );
      }

      return {
        startDateTime,
        endDateTime,
        startDateStr: dto.startDate,
        endDateStr: dto.endDate,
        startTimeStr: startTime,
        endTimeStr: endTime,
      };
    }

    if (dto.slotDate && dto.startTime && dto.endTime) {
      const startTime = this.normalizeTime(dto.startTime);
      const endTime = this.normalizeTime(dto.endTime);
      const startDateTime = DateTime.fromISO(`${dto.slotDate}T${startTime}`, {
        zone: TournamentService.bookingTimeZone,
      });
      const endDateTime = DateTime.fromISO(`${dto.slotDate}T${endTime}`, {
        zone: TournamentService.bookingTimeZone,
      });

      if (endDateTime < startDateTime) {
        throw new BadRequestException(
          "endTime must be after startTime for a single-day tournament",
        );
      }

      return {
        startDateTime,
        endDateTime,
        startDateStr: dto.slotDate,
        endDateStr: dto.slotDate,
        startTimeStr: startTime,
        endTimeStr: endTime,
      };
    }

    if (dto.startAt && dto.endAt) {
      const startDateTime = DateTime.fromISO(dto.startAt, {
        zone: "utc",
      }).setZone(TournamentService.bookingTimeZone);
      const endDateTime = DateTime.fromISO(dto.endAt, { zone: "utc" }).setZone(
        TournamentService.bookingTimeZone,
      );

      if (endDateTime < startDateTime) {
        throw new BadRequestException(
          "endAt must be after startAt for tournament booking",
        );
      }

      return {
        startDateTime,
        endDateTime,
        startDateStr: startDateTime.toFormat("yyyy-MM-dd"),
        endDateStr: endDateTime.toFormat("yyyy-MM-dd"),
        startTimeStr: startDateTime.toFormat("HH:mm:ss"),
        endTimeStr: endDateTime.toFormat("HH:mm:ss"),
      };
    }

    throw new BadRequestException(
      "Provide either slotDate/startTime/endTime or startAt/endAt for tournament booking",
    );
  }

  private normalizeTime(value: string) {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) {
      return `${trimmed}:00`;
    }

    if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    throw new BadRequestException("Invalid time format. Use HH:mm or HH:mm:ss");
  }

  private resolveRuleBooksForDate(
    ruleBooks: any[],
    histories: any[],
    slotDate: string,
  ) {
    const historiesByRuleBookId = new Map<string, any[]>();

    for (const history of histories) {
      const bucket = historiesByRuleBookId.get(history.ruleBookId) ?? [];
      bucket.push(history);
      historiesByRuleBookId.set(history.ruleBookId, bucket);
    }

    return ruleBooks
      .map((ruleBook) => {
        const versions: any[] = [];
        const currentEffectiveDate =
          ruleBook.effectiveDate ??
          ruleBook.createdAt.toISOString().split("T")[0];

        for (const history of historiesByRuleBookId.get(ruleBook.id) ?? []) {
          if (history.effectiveFromDate > slotDate) {
            continue;
          }

          versions.push({
            id: history.id,
            ruleName: history.ruleName,
            slotSelectionType: history.slotSelectionType,
            actionType: history.actionType,
            value: history.value,
            ruleConfig: history.ruleConfig,
            isActive: history.isActive,
            createdAt: history.createdAt,
            updatedAt: history.createdAt,
            effectiveDate: history.effectiveFromDate,
          });
        }

        if (currentEffectiveDate <= slotDate) {
          versions.push({
            id: ruleBook.id,
            ruleName: ruleBook.ruleName,
            slotSelectionType: ruleBook.slotSelectionType,
            actionType: ruleBook.actionType,
            value: ruleBook.value,
            ruleConfig: ruleBook.ruleConfig,
            isActive: ruleBook.isActive,
            createdAt: ruleBook.createdAt,
            updatedAt: ruleBook.updatedAt,
            effectiveDate: currentEffectiveDate,
          });
        }

        if (versions.length === 0) {
          return undefined;
        }

        versions.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
        return versions[versions.length - 1];
      })
      .filter((ruleBook) => Boolean(ruleBook));
  }

  private compareRuleBooks(
    firstRule: any,
    secondRule: any,
    _defaultPriority: number,
  ) {
    const createdAtDiff =
      firstRule.createdAt.getTime() - secondRule.createdAt.getTime();
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    const updatedAtDiff =
      firstRule.updatedAt.getTime() - secondRule.updatedAt.getTime();
    if (updatedAtDiff !== 0) {
      return updatedAtDiff;
    }

    return firstRule.id.localeCompare(secondRule.id);
  }

  get(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async update(id: string, dto: UpdateTournamentBookingDto) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Tournament booking not found");

    Object.assign(existing, {
      fieldId: dto.courts?.[0] ?? existing.fieldId ?? null,
      organizerName: dto.organizerName ?? existing.organizerName,
      organizerPhone: dto.organizerPhone ?? existing.organizerPhone,
      eventName: dto.eventName ?? existing.eventName,
      startAt: dto.startAt ? new Date(dto.startAt) : existing.startAt,
      endAt: dto.endAt ? new Date(dto.endAt) : existing.endAt,
      courts: dto.courts ?? existing.courts,
      totalAmount: dto.totalAmount ?? existing.totalAmount,
      advancePaid: dto.advancePaid ?? existing.advancePaid,
      notes: dto.notes ?? existing.notes,
    });

    return this.repo.save(existing);
  }

  async recordPayment(
    id: string,
    amount: string,
    method: string,
    note?: string,
  ) {
    const booking = await this.repo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException("Tournament booking not found");

    const payment = this.paymentRepo.create({
      tournamentId: id,
      amount,
      method: method as any,
      note,
    });

    booking.advancePaid = (
      Number(booking.advancePaid || 0) + Number(amount || 0)
    ).toString();

    await this.paymentRepo.save(payment);
    await this.repo.save(booking);

    return { booking, payment };
  }

  async cancel(id: string, refund: boolean, refundAmount?: string) {
    return this.repo.manager.transaction(async (manager) => {
      const bookingRepo = manager.getRepository(TournamentBooking);
      const slotRepo = manager.getRepository(FieldSlot);
      const bookingRowRepo = manager.getRepository(Booking);
      const fieldRepo = manager.getRepository(Field);
      const historyRepo = manager.getRepository(FieldRuleBookHistory);

      const booking = await bookingRepo
        .createQueryBuilder("tournament")
        .setLock("pessimistic_write")
        .where("tournament.id = :id", { id })
        .getOne();

      if (!booking) throw new NotFoundException("Tournament booking not found");

      booking.status = "cancelled";

      const slots = await slotRepo
        .createQueryBuilder("slot")
        .setLock("pessimistic_write")
        .where("slot.tournament_booking_id = :id", { id })
        .getMany();

      for (const slot of slots) {
        // fast-path: restore the original slot price if we saved it earlier
        // @ts-ignore
        if (slot.previousPrice) {
          // @ts-ignore
          slot.price = slot.previousPrice;
        } else {
          // otherwise compute price from schedule settings and rule books
          const field = await fieldRepo.findOne({
            where: { id: slot.fieldId },
            relations: { scheduleSettings: true, ruleBooks: true },
          });

          let resolvedPrice = field?.scheduleSettings?.basePrice ?? slot.price;

          if (field?.ruleBooks && field.ruleBooks.length > 0) {
            const ruleBookIds = field.ruleBooks.map((r) => r.id);
            const histories = await historyRepo
              .createQueryBuilder("h")
              .where("h.rule_book_id IN (:...ids)", { ids: ruleBookIds })
              .andWhere("h.effective_from_date <= :slotDate", {
                slotDate: slot.slotDate,
              })
              .orderBy("h.effective_from_date", "ASC")
              .getMany();

            const activeRuleBooks = this.resolveRuleBooksForDate(
              field.ruleBooks ?? [],
              histories,
              slot.slotDate,
            ).filter((rb) => rb.isActive);

            const specificRules = activeRuleBooks
              .filter(
                (ruleBook) =>
                  ruleBook.slotSelectionType === ("SPECIFIC_SLOTS" as any),
              )
              .sort((a, b) => this.compareRuleBooks(a, b, 1));

            const timeRangeRules = activeRuleBooks
              .filter(
                (ruleBook) =>
                  ruleBook.slotSelectionType === ("TIME_RANGE" as any),
              )
              .sort((a, b) => this.compareRuleBooks(a, b, 2));

            const allSlotRules = activeRuleBooks
              .filter(
                (ruleBook) =>
                  ruleBook.slotSelectionType === ("ALL_SLOTS" as any),
              )
              .sort((a, b) => this.compareRuleBooks(a, b, 3));

            const date = new Date(slot.slotDate);
            const weekdayNames = [
              "sunday",
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
            ];
            const slotWeekday = weekdayNames[date.getDay()];

            resolvedPrice = FieldSlotGenerator.resolveSlotPriceFromRules(
              { startTime: slot.startTime, endTime: slot.endTime },
              slotWeekday,
              slot.slotDate,
              specificRules as any,
              timeRangeRules as any,
              allSlotRules as any,
              field.scheduleSettings?.basePrice ?? slot.price,
            );
          }

          slot.price = resolvedPrice;
        }

        // clear stored previous price and release slot
        // @ts-ignore
        slot.previousPrice = null;
        slot.status = "available" as any;
        slot.slotType = "normal" as any;
        slot.tournamentBookingId = null;
      }

      const relatedBookings = slots.length
        ? await bookingRowRepo
            .createQueryBuilder("booking")
            .innerJoin("booking.slot", "slot")
            .setLock("pessimistic_write")
            .where("slot.tournament_booking_id = :id", { id })
            .getMany()
        : [];

      for (const relatedBooking of relatedBookings) {
        relatedBooking.status = "cancelled";
      }

      await slotRepo.save(slots);
      await bookingRowRepo.save(relatedBookings);
      const savedBooking = await bookingRepo.save(booking);

      return {
        booking: savedBooking,
        refundGiven: !!refund,
        refundAmount: refund ? (refundAmount ?? savedBooking.advancePaid) : "0",
      };
    });
  }

  async markCompleted(id: string, remainingAmount?: string, method?: string) {
    return this.repo.manager.transaction(async (manager) => {
      const bookingRepo = manager.getRepository(TournamentBooking);
      const slotRepo = manager.getRepository(FieldSlot);
      const bookingRowRepo = manager.getRepository(Booking);
      const paymentRepo = manager.getRepository(TournamentPayment);

      const booking = await bookingRepo
        .createQueryBuilder("tournament")
        .setLock("pessimistic_write")
        .where("tournament.id = :id", { id })
        .getOne();

      if (!booking) throw new NotFoundException("Tournament booking not found");

      if (booking.status === "completed") {
        return { booking, payment: null };
      }

      const slots = await slotRepo
        .createQueryBuilder("slot")
        .setLock("pessimistic_write")
        .where("slot.tournament_booking_id = :id", { id })
        .getMany();

      const relatedBookings = slots.length
        ? await bookingRowRepo
            .createQueryBuilder("booking")
            .innerJoin("booking.slot", "slot")
            .setLock("pessimistic_write")
            .where("slot.tournament_booking_id = :id", { id })
            .getMany()
        : [];

      for (const slot of slots) {
        slot.status = "completed" as any;
        slot.slotType = "tournament" as any;
        slot.tournamentBookingId = booking.id;
      }

      // Map slot prices by id so we can update the related booking amounts
      const slotPriceById: Record<string, string> = {};
      for (const slot of slots) {
        slotPriceById[slot.id] = slot.price;
      }

      for (const relatedBooking of relatedBookings) {
        relatedBooking.status = "completed";
        relatedBooking.bookingType = "tournament";
        const slotPrice = slotPriceById[relatedBooking.slotId];
        if (slotPrice) {
          relatedBooking.baseAmount = slotPrice;
          relatedBooking.totalAmount = slotPrice;
        }
      }

      const settledAmount =
        remainingAmount ??
        this.sumAmounts([
          Number(booking.totalAmount || 0) - Number(booking.advancePaid || 0),
        ]);

      let payment: TournamentPayment | null = null;

      if (Number(settledAmount) > 0) {
        payment = paymentRepo.create({
          tournamentId: booking.id,
          amount: settledAmount,
          method: (method ?? "cash") as any,
          note: "Tournament completion settlement",
        });

        payment = await paymentRepo.save(payment);
        booking.advancePaid = this.sumAmounts([
          booking.advancePaid,
          settledAmount,
        ]);
      }

      booking.status = "completed";

      await slotRepo.save(slots);
      await bookingRowRepo.save(relatedBookings);

      const savedBooking = await bookingRepo.save(booking);

      return { booking: savedBooking, payment };
    });
  }
}
