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

  constructor(
    @InjectRepository(Field)
    private readonly fieldsRepository: Repository<Field>,
    private readonly fieldSlotSyncService: FieldSlotSyncService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateTomorrowSlotsFromRuleBooks(): Promise<void> {
    const targetDate = FieldSlotGenerator.getDateStringFromOffset(1);
    const targetWeekday = FieldSlotGenerator.getWeekdayFromOffset(1);

    const fields = await this.fieldsRepository.find({
      where: { isActive: true },
      relations: { scheduleSettings: true, ruleBooks: true },
    });

    this.logger.log(
      `Midnight slot cron started for date=${targetDate} weekday=${targetWeekday}. Active fields=${fields.length}`,
    );

    let processedCount = 0;
    let failedCount = 0;

    for (const field of fields) {
      if (!field.scheduleSettings) {
        continue;
      }

      try {
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
}
