import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { RuleBookSlotSelectionType } from "../dto/create-field-rule-book.dto";
import { FieldRuleBook } from "../entities/field-rule-book.entity";
import { Field } from "../entities/field.entity";
import { FieldSlot } from "../entities/field-slot.entity";
import { FieldSlotGenerator } from "./field-slot-generator";

@Injectable()
export class FieldSlotSyncService {
  private readonly logger = new Logger(FieldSlotSyncService.name);

  constructor(
    @InjectRepository(Field)
    private readonly fieldsRepository: Repository<Field>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotsRepository: Repository<FieldSlot>,
  ) {}

  async syncFieldWindow(
    fieldId: string,
    startOffsetDays: number,
    days: number,
  ): Promise<void> {
    for (
      let offset = startOffsetDays;
      offset < startOffsetDays + days;
      offset++
    ) {
      const slotDate = FieldSlotGenerator.getDateStringFromOffset(offset);
      await this.syncFieldDate(fieldId, slotDate);
    }
  }

  async syncFieldDate(fieldId: string, slotDate: string): Promise<void> {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.fieldSlotsRepository.manager.transaction(async (manager) => {
          const fieldRepository = manager.getRepository(Field);
          const slotRepository = manager.getRepository(FieldSlot);

          // Serialize sync for the same field/date to avoid concurrent duplicate inserts.
          await manager.query("SELECT pg_advisory_xact_lock(hashtext($1));", [
            `field-slot-sync:${fieldId}:${slotDate}`,
          ]);

          const field = await fieldRepository.findOne({
            where: { id: fieldId },
            relations: { scheduleSettings: true, ruleBooks: true },
          });

          if (!field?.scheduleSettings) {
            return;
          }

          const scheduleSettings = field.scheduleSettings;
          const weekday = this.getWeekdayFromDateString(slotDate);

          const generatedSlots =
            FieldSlotGenerator.generateSlotsFromScheduleSettings(
              slotDate,
              scheduleSettings.openingTime,
              scheduleSettings.closingTime,
              scheduleSettings.slotDurationMin,
              scheduleSettings.breakBetweenMin,
              scheduleSettings.basePrice,
            );

          const existingSlots = await slotRepository
            .createQueryBuilder("slot")
            .where("slot.field_id = :fieldId", { fieldId })
            .andWhere("slot.slot_date = :slotDate", { slotDate })
            .setLock("pessimistic_write")
            .getMany();

          const existingSlotsByStartTime = new Map(
            existingSlots.map((slot) => [
              this.normalizeTimeForKey(slot.startTime),
              slot,
            ]),
          );
          const generatedStartTimes = new Set(
            generatedSlots.map((slot) =>
              this.normalizeTimeForKey(slot.startTime),
            ),
          );

          const activeRuleBooks = (field.ruleBooks ?? []).filter(
            (ruleBook) => ruleBook.isActive,
          );

          const specificRules = activeRuleBooks.filter(
            (ruleBook) =>
              ruleBook.slotSelectionType ===
              RuleBookSlotSelectionType.SPECIFIC_SLOTS,
          );
          const timeRangeRules = activeRuleBooks.filter(
            (ruleBook) =>
              ruleBook.slotSelectionType ===
              RuleBookSlotSelectionType.TIME_RANGE,
          );
          const allSlotRules = activeRuleBooks.filter(
            (ruleBook) =>
              ruleBook.slotSelectionType ===
              RuleBookSlotSelectionType.ALL_SLOTS,
          );

          const slotEntities: FieldSlot[] = [];

          for (const slot of generatedSlots) {
            const resolvedPrice = FieldSlotGenerator.resolveSlotPriceFromRules(
              slot,
              weekday,
              slotDate,
              specificRules,
              timeRangeRules,
              allSlotRules,
              scheduleSettings.basePrice,
            );

            const existingSlot = existingSlotsByStartTime.get(
              this.normalizeTimeForKey(slot.startTime),
            );
            if (existingSlot) {
              if (existingSlot.status !== "booked") {
                existingSlot.price = resolvedPrice;
                existingSlot.endTime = slot.endTime;
                if (existingSlot.status !== "cancelled") {
                  existingSlot.status = "available";
                }
              }
              slotEntities.push(existingSlot);
              continue;
            }

            slotEntities.push(
              slotRepository.create({
                fieldId,
                slotDate,
                startTime: slot.startTime,
                endTime: slot.endTime,
                price: resolvedPrice,
                status: "available",
              }),
            );
          }

          // Retire stale non-booked slots that no longer match generated schedule.
          for (const existingSlot of existingSlots) {
            if (
              generatedStartTimes.has(
                this.normalizeTimeForKey(existingSlot.startTime),
              )
            ) {
              continue;
            }

            if (existingSlot.status === "booked") {
              continue;
            }

            existingSlot.status = "blocked";
            slotEntities.push(existingSlot);
          }

          if (slotEntities.length === 0) {
            return;
          }

          await slotRepository.save(slotEntities);

          this.logger.log(
            `Synchronized ${slotEntities.length} slots for fieldId=${fieldId} on ${slotDate}`,
          );
        });

        return;
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;

        if (!this.isUniqueConstraintViolation(error) || isLastAttempt) {
          throw error;
        }

        this.logger.warn(
          `Concurrent slot sync conflict for fieldId=${fieldId} on ${slotDate}; retrying (attempt ${attempt + 1}/${maxAttempts})`,
        );
      }
    }
  }

  async retireOldestActiveSlotDate(
    fieldId: string,
  ): Promise<string | undefined> {
    const today = FieldSlotGenerator.getCurrentDateString();

    const oldestSlot = await this.fieldSlotsRepository
      .createQueryBuilder("slot")
      .select("slot.slot_date", "slotDate")
      .where("slot.field_id = :fieldId", { fieldId })
      .andWhere("slot.slot_date < :today", { today })
      .andWhere("slot.status != :blockedStatus", { blockedStatus: "blocked" })
      .orderBy("slot.slot_date", "ASC")
      .getRawOne<{ slotDate: string }>();

    if (!oldestSlot?.slotDate) {
      return undefined;
    }

    await this.fieldSlotsRepository.manager.transaction(async (manager) => {
      const slotRepository = manager.getRepository(FieldSlot);

      const slotsToRetire = await slotRepository
        .createQueryBuilder("slot")
        .where("slot.field_id = :fieldId", { fieldId })
        .andWhere("slot.slot_date = :slotDate", {
          slotDate: oldestSlot.slotDate,
        })
        .setLock("pessimistic_write")
        .getMany();

      const updatableSlots = slotsToRetire.filter(
        (slot) => slot.status !== "booked" && slot.status !== "blocked",
      );

      if (updatableSlots.length === 0) {
        return;
      }

      for (const slot of updatableSlots) {
        slot.status = "blocked";
      }

      await slotRepository.save(updatableSlots);

      this.logger.log(
        `Retired ${updatableSlots.length} slots for fieldId=${fieldId} on ${oldestSlot.slotDate}`,
      );
    });

    return oldestSlot.slotDate;
  }

  async appendNextSlotDate(fieldId: string): Promise<string | undefined> {
    const latestSlot = await this.fieldSlotsRepository
      .createQueryBuilder("slot")
      .select("MAX(slot.slot_date)", "slotDate")
      .where("slot.field_id = :fieldId", { fieldId })
      .getRawOne<{ slotDate: string }>();

    if (!latestSlot?.slotDate) {
      return undefined;
    }

    const nextSlotDate = this.addDaysToDateString(latestSlot.slotDate, 1);
    await this.syncFieldDate(fieldId, nextSlotDate);

    return nextSlotDate;
  }

  async retireFieldDate(fieldId: string, slotDate: string): Promise<void> {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.fieldSlotsRepository.manager.transaction(async (manager) => {
          const fieldRepository = manager.getRepository(Field);
          const slotRepository = manager.getRepository(FieldSlot);

          const field = await fieldRepository.findOne({
            where: { id: fieldId },
            relations: { scheduleSettings: true },
          });

          if (!field?.scheduleSettings) {
            return;
          }

          const existingSlots = await slotRepository
            .createQueryBuilder("slot")
            .where("slot.field_id = :fieldId", { fieldId })
            .andWhere("slot.slot_date = :slotDate", { slotDate })
            .setLock("pessimistic_write")
            .getMany();

          const slotsToRetire = existingSlots.filter(
            (slot) => slot.status !== "booked" && slot.status !== "blocked",
          );

          if (slotsToRetire.length === 0) {
            return;
          }

          for (const slot of slotsToRetire) {
            slot.status = "blocked";
          }

          await slotRepository.save(slotsToRetire);

          this.logger.log(
            `Retired ${slotsToRetire.length} slots for fieldId=${fieldId} on ${slotDate}`,
          );
        });

        return;
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;

        if (!this.isUniqueConstraintViolation(error) || isLastAttempt) {
          throw error;
        }

        this.logger.warn(
          `Concurrent slot retire conflict for fieldId=${fieldId} on ${slotDate}; retrying (attempt ${attempt + 1}/${maxAttempts})`,
        );
      }
    }
  }

  private getWeekdayFromDateString(slotDate: string): string {
    const date = new Date(`${slotDate}T00:00:00`);

    return [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ][date.getDay()];
  }

  private addDaysToDateString(slotDate: string, daysOffset: number): string {
    const date = new Date(`${slotDate}T00:00:00`);
    date.setDate(date.getDate() + daysOffset);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  private normalizeTimeForKey(time: string): string {
    const trimmed = time.trim();
    return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed;
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error as QueryFailedError & {
      driverError?: { code?: string };
    };

    return driverError.driverError?.code === "23505";
  }
}
