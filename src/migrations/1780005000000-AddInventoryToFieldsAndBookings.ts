import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInventoryToFieldsAndBookings1780005000000 implements MigrationInterface {
  name = "AddInventoryToFieldsAndBookings1780005000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fields"
      ADD COLUMN IF NOT EXISTS "inventory" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD COLUMN IF NOT EXISTS "selected_inventory" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "cancelled_bookings"
      ADD COLUMN IF NOT EXISTS "selected_inventory" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cancelled_bookings"
      DROP COLUMN IF EXISTS "selected_inventory"
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      DROP COLUMN IF EXISTS "selected_inventory"
    `);

    await queryRunner.query(`
      ALTER TABLE "fields"
      DROP COLUMN IF EXISTS "inventory"
    `);
  }
}
