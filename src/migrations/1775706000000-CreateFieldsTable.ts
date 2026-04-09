import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFieldsTable1775706000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS "fields" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" uuid NOT NULL, "name" character varying NOT NULL, "city" character varying, "address" character varying, "description" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fields_id" PRIMARY KEY ("id"))',
    );

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_fields_owner_id" ON "fields" ("owner_id")',
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'UQ_fields_owner_name'
            AND conrelid = 'public.fields'::regclass
        ) THEN
          ALTER TABLE "fields"
          ADD CONSTRAINT "UQ_fields_owner_name" UNIQUE ("owner_id", "name");
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_fields_owner_id_admins'
            AND conrelid = 'public.fields'::regclass
        ) THEN
          ALTER TABLE "fields"
          ADD CONSTRAINT "FK_fields_owner_id_admins"
          FOREIGN KEY ("owner_id") REFERENCES "admins"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "fields" DROP CONSTRAINT IF EXISTS "FK_fields_owner_id_admins"',
    );
    await queryRunner.query(
      'ALTER TABLE "fields" DROP CONSTRAINT IF EXISTS "UQ_fields_owner_name"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_fields_owner_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "fields"');
  }
}
