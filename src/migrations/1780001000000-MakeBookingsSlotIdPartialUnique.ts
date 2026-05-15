import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeBookingsSlotIdPartialUnique1780001000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove any existing unique constraint/index on slot_id so we can create
    // a partial unique index that ignores cancelled bookings.
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "UQ_bookings_slot_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_slot_id"`);
    // Some older deployments may have generated a hashed index name; attempt to drop common variants.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_409d5b76fb2b0501a8c72dd4ee"`,
    );

    // Create a unique index for slot_id only when booking status is not 'cancelled'.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bookings_slot_id_active_unique" ON "bookings" ("slot_id") WHERE status <> 'cancelled'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: drop the partial unique index and restore the original unique constraint
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bookings_slot_id_active_unique"`,
    );
    // Restore the original unique constraint on slot_id
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT IF NOT EXISTS "UQ_bookings_slot_id" UNIQUE ("slot_id")`,
    );
  }
}
