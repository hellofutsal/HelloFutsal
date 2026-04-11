import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FieldScheduleSettings } from "./entities/field-schedule-settings.entity";
import { Field } from "./entities/field.entity";
import { FieldSlot } from "./entities/field-slot.entity";
import { FieldsController } from "./fields.controller";
import { FieldsService } from "./fields.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Field, FieldScheduleSettings, FieldSlot]),
  ],
  controllers: [FieldsController],
  providers: [FieldsService],
  exports: [FieldsService],
})
export class FieldsModule {}
