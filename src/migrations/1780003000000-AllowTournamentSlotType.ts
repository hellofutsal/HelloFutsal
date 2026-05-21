import { MigrationInterface, QueryRunner } from "typeorm";

export class AllowTournamentSlotType1780003000000 implements MigrationInterface {
  name = "AllowTournamentSlotType1780003000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "field_slots"
      DROP CONSTRAINT IF EXISTS "chk_slot_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "field_slots"
      ADD CONSTRAINT "chk_slot_type"
      CHECK (slot_type IN ('normal', 'membership', 'tournament'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "field_slots"
      DROP CONSTRAINT IF EXISTS "chk_slot_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "field_slots"
      ADD CONSTRAINT "chk_slot_type"
      CHECK (slot_type IN ('normal', 'membership'))
    `);
  }
}
