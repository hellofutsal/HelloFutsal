import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlotTypeToFieldSlot1775734200000 implements MigrationInterface {
  name = "AddSlotTypeToFieldSlot1775734200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "field_slots"
      ADD COLUMN "slot_type" varchar NOT NULL DEFAULT 'normal';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "field_slots" DROP COLUMN "slot_type";
    `);
  }
}
