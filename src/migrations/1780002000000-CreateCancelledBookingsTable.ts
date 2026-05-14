import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCancelledBookingsTable1780002000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cancelled_bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "original_booking_id" uuid,
        "field_id" uuid NOT NULL,
        "slot_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "booking_type" varchar,
        "base_amount" numeric(12,2) DEFAULT 0,
        "total_amount" numeric(12,2) DEFAULT 0,
        "discount" boolean DEFAULT false,
        "extra_amount" numeric(12,2) DEFAULT 0,
        "discount_amount" numeric(12,2) DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "cancelled_at" timestamptz NOT NULL DEFAULT now(),
        "cancelled_by" uuid,
        CONSTRAINT "PK_cancelled_bookings_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cancelled_bookings_field_id" ON "cancelled_bookings" ("field_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cancelled_bookings_user_id" ON "cancelled_bookings" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cancelled_bookings_slot_id" ON "cancelled_bookings" ("slot_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cancelled_bookings_slot_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cancelled_bookings_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cancelled_bookings_field_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "cancelled_bookings"`);
  }
}
