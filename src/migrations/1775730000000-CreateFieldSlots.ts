import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFieldSlots1775730000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "field_slots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "field_id" uuid NOT NULL,
        "slot_date" date NOT NULL,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "price" numeric(12,2) NOT NULL,
        "status" character varying NOT NULL DEFAULT 'available',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_field_slots_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_field_slots_field_date_start_time" UNIQUE ("field_id", "slot_date", "start_time"),
        CONSTRAINT "FK_field_slots_field_id_fields" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "field_slots"');
  }
}
