import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCancelledBookingsTable1780002000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cancelled_bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "original_booking_id" uuid,
        "field_id" uuid NULL,
        "slot_id" uuid NULL,
        "user_id" uuid NULL,
        "booking_type" varchar,
        "base_amount" numeric(12,2) DEFAULT 0,
        "total_amount" numeric(12,2) DEFAULT 0,
        "discount" boolean DEFAULT false,
        "extra_amount" numeric(12,2) DEFAULT 0,
        "discount_amount" numeric(12,2) DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL,
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

    await queryRunner.query(`
      ALTER TABLE "cancelled_bookings"
      ADD CONSTRAINT "FK_cancelled_bookings_field_id"
      FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "cancelled_bookings"
      ADD CONSTRAINT "FK_cancelled_bookings_slot_id"
      FOREIGN KEY ("slot_id") REFERENCES "field_slots"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "cancelled_bookings"
      ADD CONSTRAINT "FK_cancelled_bookings_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cancelled_bookings" DROP CONSTRAINT IF EXISTS "FK_cancelled_bookings_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cancelled_bookings" DROP CONSTRAINT IF EXISTS "FK_cancelled_bookings_slot_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cancelled_bookings" DROP CONSTRAINT IF EXISTS "FK_cancelled_bookings_field_id"`,
    );

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
