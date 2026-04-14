import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBookingsTable1775733000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "field_id" uuid NOT NULL,
        "slot_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'booked',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bookings_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bookings_slot_id" UNIQUE ("slot_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bookings_field_id" ON "bookings" ("field_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bookings_user_id" ON "bookings" ("user_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD CONSTRAINT "FK_bookings_field_id"
      FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD CONSTRAINT "FK_bookings_slot_id"
      FOREIGN KEY ("slot_id") REFERENCES "field_slots"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD CONSTRAINT "FK_bookings_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "FK_bookings_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "FK_bookings_slot_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "FK_bookings_field_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_field_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);
  }
}
