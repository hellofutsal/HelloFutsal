import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTournamentBooking1778896536501 implements MigrationInterface {
  name = "AddTournamentBooking1778896536501";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "tournament_bookings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organizer_name" character varying NOT NULL,
                "organizer_phone" character varying,
                "event_name" character varying NOT NULL,
                "start_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "end_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "courts" jsonb NOT NULL DEFAULT '[]',
                "total_amount" numeric(12,2) NOT NULL DEFAULT '0',
                "advance_paid" numeric(12,2) NOT NULL DEFAULT '0',
                "notes" text,
                "status" character varying NOT NULL DEFAULT 'confirmed',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_461dc5dfc1464252ae742c6dbb1" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_5d48b2c228c8803d6ef90e860e"
            ON "tournament_bookings" ("organizer_phone")
        `);

    await queryRunner.query(`
            ALTER TABLE "field_slots"
            ADD COLUMN IF NOT EXISTS "tournament_booking_id" uuid
        `);

    const fieldSlotsTable = await queryRunner.getTable("field_slots");
    const tournamentSlotForeignKey = fieldSlotsTable?.foreignKeys.find(
      (foreignKey) => foreignKey.columnNames.includes("tournament_booking_id"),
    );

    if (!tournamentSlotForeignKey) {
      await queryRunner.query(`
                ALTER TABLE "field_slots"
                ADD CONSTRAINT "FK_07885d0c3201a94567e5de577ed"
                FOREIGN KEY ("tournament_booking_id") REFERENCES "tournament_bookings"("id")
                ON DELETE SET NULL ON UPDATE NO ACTION
            `);
    }

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "tournament_payments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tournament_id" uuid NOT NULL,
                "amount" numeric(12,2) NOT NULL,
                "method" character varying NOT NULL,
                "note" text,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_507e25f1b6b1c1ee9f941898bb2" PRIMARY KEY ("id")
            )
        `);

    const tournamentPaymentsTable = await queryRunner.getTable(
      "tournament_payments",
    );
    const tournamentPaymentForeignKey =
      tournamentPaymentsTable?.foreignKeys.find((foreignKey) =>
        foreignKey.columnNames.includes("tournament_id"),
      );

    if (!tournamentPaymentForeignKey) {
      await queryRunner.query(`
                ALTER TABLE "tournament_payments"
                ADD CONSTRAINT "FK_d4a71f4e4a5354c1d108b2d91b3"
                FOREIGN KEY ("tournament_id") REFERENCES "tournament_bookings"("id")
                ON DELETE CASCADE ON UPDATE NO ACTION
            `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournament_payments" DROP CONSTRAINT IF EXISTS "FK_d4a71f4e4a5354c1d108b2d91b3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "field_slots" DROP CONSTRAINT IF EXISTS "FK_07885d0c3201a94567e5de577ed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "field_slots" DROP COLUMN IF EXISTS "tournament_booking_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_5d48b2c228c8803d6ef90e860e"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "tournament_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tournament_bookings"`);
  }
}
