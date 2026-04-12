import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Field } from "../entities/field.entity";
import { FieldSlotGenerator } from "./field-slot-generator";
import { FieldSlotSyncService } from "./field-slot-sync.service";

@Injectable()
export class FieldSlotCronService {
  private readonly logger = new Logger(FieldSlotCronService.name);
  private readonly slotWindowDays = this.resolveSlotWindowDays();

  constructor(
    @InjectRepository(Field)
    private readonly fieldsRepository: Repository<Field>,
    private readonly fieldSlotSyncService: FieldSlotSyncService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateTomorrowSlotsFromRuleBooks(): Promise<void> {
    const retireOffsetDays = -1;
    const targetOffsetDays = this.slotWindowDays - 1;
    const retireDate =
      FieldSlotGenerator.getDateStringFromOffset(retireOffsetDays);
    const targetDate =
      FieldSlotGenerator.getDateStringFromOffset(targetOffsetDays);
    const targetWeekday =
      FieldSlotGenerator.getWeekdayFromOffset(targetOffsetDays);

    const fields = await this.fieldsRepository.find({
      where: { isActive: true },
      relations: { scheduleSettings: true, ruleBooks: true },
    });

    this.logger.log(
      `Midnight slot cron started for retire date=${retireDate} and extension date=${targetDate} weekday=${targetWeekday}. Active fields=${fields.length}`,
    );

    let processedCount = 0;
    let failedCount = 0;

    for (const field of fields) {
      if (!field.scheduleSettings) {
        continue;
      }

      try {
        await this.fieldSlotSyncService.retireFieldDate(field.id, retireDate);
        await this.fieldSlotSyncService.syncFieldDate(field.id, targetDate);
        processedCount += 1;
      } catch (error) {
        failedCount += 1;
        this.logger.error(
          `Failed to generate slots for fieldId=${field.id} on ${targetDate}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `Midnight slot cron finished for date=${targetDate}. Processed=${processedCount}, Failed=${failedCount}`,
    );
  }

  private resolveSlotWindowDays(): number {
    const rawValue = process.env.INITIAL_SLOT_WINDOW_DAYS;

    if (!rawValue) {
      return 30;
    }

    const parsedValue = Number(rawValue);
    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      this.logger.warn(
        `Invalid INITIAL_SLOT_WINDOW_DAYS value "${rawValue}". Falling back to 30.`,
      );
      return 30;
    }

    return parsedValue;
  }
}
