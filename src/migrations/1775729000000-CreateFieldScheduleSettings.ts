import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFieldScheduleSettings1775729000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "field_schedule_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "field_id" uuid NOT NULL,
        "slot_duration_min" integer NOT NULL DEFAULT 60,
        "break_between_min" integer NOT NULL DEFAULT 15,
        "base_price" numeric(12,2) NOT NULL DEFAULT 120.00,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_field_schedule_settings_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_field_schedule_settings_field_id" UNIQUE ("field_id"),
        CONSTRAINT "FK_field_schedule_settings_field_id_fields" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "field_schedule_settings"');
  }
}
