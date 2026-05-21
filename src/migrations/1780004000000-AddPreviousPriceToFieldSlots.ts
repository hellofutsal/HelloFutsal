import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPreviousPriceToFieldSlots1780004000000 implements MigrationInterface {
  name = "AddPreviousPriceToFieldSlots1780004000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "field_slots"
      ADD COLUMN IF NOT EXISTS "previous_price" numeric(12,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "field_slots"
      DROP COLUMN IF EXISTS "previous_price"
    `);
  }
}
