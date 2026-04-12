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
    const fields = await this.fieldsRepository.find({
      where: { isActive: true },
      relations: { scheduleSettings: true, ruleBooks: true },
    });

    this.logger.log(
      `Midnight slot cron started. Active fields=${fields.length}`,
    );

    let processedCount = 0;
    let failedCount = 0;

    for (const field of fields) {
      if (!field.scheduleSettings) {
        continue;
      }

      try {
        const retiredDate =
          await this.fieldSlotSyncService.retireOldestActiveSlotDate(field.id);
        const appendedDate = await this.fieldSlotSyncService.appendNextSlotDate(
          field.id,
        );
        processedCount += 1;

        this.logger.log(
          `Rolled slot window for fieldId=${field.id}. Retired=${retiredDate ?? "none"}, Appended=${appendedDate ?? "none"}`,
        );
      } catch (error) {
        failedCount += 1;
        this.logger.error(
          `Failed to roll slots for fieldId=${field.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `Midnight slot cron finished. Processed=${processedCount}, Failed=${failedCount}`,
    );
  }
}
