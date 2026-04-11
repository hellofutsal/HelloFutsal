import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFieldRuleBooks1775731000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "field_rule_books" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "field_id" uuid NOT NULL,
        "rule_name" character varying NOT NULL,
        "slot_selection_type" character varying NOT NULL,
        "action_type" character varying NOT NULL,
        "value" numeric(12,2) NOT NULL,
        "rule_config" jsonb NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_field_rule_books_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_field_rule_books_field_rule_name" UNIQUE ("field_id", "rule_name"),
        CONSTRAINT "FK_field_rule_books_field_id_fields" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "field_rule_books"');
  }
}
