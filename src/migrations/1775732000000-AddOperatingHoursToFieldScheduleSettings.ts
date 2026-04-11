import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOperatingHoursToFieldScheduleSettings1775732000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "field_schedule_settings" ADD COLUMN IF NOT EXISTS "opening_time" time NOT NULL DEFAULT \'06:00:00\'',
    );
    await queryRunner.query(
      'ALTER TABLE "field_schedule_settings" ADD COLUMN IF NOT EXISTS "closing_time" time NOT NULL DEFAULT \'23:00:00\'',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "field_schedule_settings" DROP COLUMN IF EXISTS "closing_time"',
    );
    await queryRunner.query(
      'ALTER TABLE "field_schedule_settings" DROP COLUMN IF EXISTS "opening_time"',
    );
  }
}
