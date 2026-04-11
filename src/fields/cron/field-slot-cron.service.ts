import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RuleBookSlotSelectionType } from "../dto/create-field-rule-book.dto";
import { FieldRuleBook } from "../entities/field-rule-book.entity";
import { Field } from "../entities/field.entity";
import { FieldSlot } from "../entities/field-slot.entity";
import { FieldSlotGenerator } from "./field-slot-generator";

@Injectable()
export class FieldSlotCronService {
  private readonly logger = new Logger(FieldSlotCronService.name);

  constructor(
    @InjectRepository(Field)
    private readonly fieldsRepository: Repository<Field>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotsRepository: Repository<FieldSlot>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateTomorrowSlotsFromRuleBooks(): Promise<void> {
    const targetDate = FieldSlotGenerator.getDateStringFromOffset(1);
    const targetWeekday = FieldSlotGenerator.getWeekdayFromOffset(1);

    const fields = await this.fieldsRepository.find({
      where: { isActive: true },
      relations: { scheduleSettings: true, ruleBooks: true },
    });

    for (const field of fields) {
      if (!field.scheduleSettings) {
        continue;
      }

      await this.generateSlotsForFieldDate(field, targetDate, targetWeekday);
    }
  }

  private async generateSlotsForFieldDate(
    field: Field,
    slotDate: string,
    weekday: string,
  ): Promise<void> {
    const scheduleSettings = field.scheduleSettings;
    if (!scheduleSettings) {
      return;
    }

    const generatedSlots = FieldSlotGenerator.generateSlotsFromScheduleSettings(
      slotDate,
      scheduleSettings.openingTime,
      scheduleSettings.closingTime,
      scheduleSettings.slotDurationMin,
      scheduleSettings.breakBetweenMin,
      scheduleSettings.basePrice,
    );

    const existingSlots = await this.fieldSlotsRepository.find({
      where: { fieldId: field.id, slotDate },
    });

    const existingSlotsByStartTime = new Map(
      existingSlots.map((slot) => [slot.startTime, slot]),
    );

    const activeRuleBooks = (field.ruleBooks ?? []).filter(
      (ruleBook) => ruleBook.isActive,
    );

    const specificRules = activeRuleBooks.filter(
      (ruleBook) =>
        ruleBook.slotSelectionType === RuleBookSlotSelectionType.SPECIFIC_SLOTS,
    );
    const timeRangeRules = activeRuleBooks.filter(
      (ruleBook) =>
        ruleBook.slotSelectionType === RuleBookSlotSelectionType.TIME_RANGE,
    );
    const allSlotRules = activeRuleBooks.filter(
      (ruleBook) =>
        ruleBook.slotSelectionType === RuleBookSlotSelectionType.ALL_SLOTS,
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

      const existingSlot = existingSlotsByStartTime.get(slot.startTime);
      if (existingSlot) {
        if (existingSlot.status !== "booked") {
          existingSlot.price = resolvedPrice;
          existingSlot.endTime = slot.endTime;
        }
        slotEntities.push(existingSlot);
        continue;
      }

      slotEntities.push(
        this.fieldSlotsRepository.create({
          fieldId: field.id,
          slotDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          price: resolvedPrice,
          status: "available",
        }),
      );
    }

    if (slotEntities.length === 0) {
      return;
    }

    await this.fieldSlotsRepository.save(slotEntities);

    this.logger.debug(
      `Generated ${slotEntities.length} slots for fieldId=${field.id} on ${slotDate}`,
    );
  }
}
