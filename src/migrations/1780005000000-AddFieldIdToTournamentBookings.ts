import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldIdToTournamentBookings1780005000000 implements MigrationInterface {
  name = "AddFieldIdToTournamentBookings1780005000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tournament_bookings"
      ADD COLUMN IF NOT EXISTS "field_id" uuid
    `);

    await queryRunner.query(`
      UPDATE "tournament_bookings"
      SET "field_id" = NULLIF(("courts"->>0), '')::uuid
      WHERE "field_id" IS NULL
        AND jsonb_typeof("courts") = 'array'
        AND jsonb_array_length("courts") > 0
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tournament_bookings_field_id"
      ON "tournament_bookings" ("field_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "tournament_bookings"
      ADD CONSTRAINT "FK_tournament_bookings_field_id_fields"
      FOREIGN KEY ("field_id") REFERENCES "fields"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tournament_bookings"
      DROP CONSTRAINT IF EXISTS "FK_tournament_bookings_field_id_fields"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_tournament_bookings_field_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "tournament_bookings"
      DROP COLUMN IF EXISTS "field_id"
    `);
  }
}
