import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateFieldsTableStructure1775720000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'fields'
            AND column_name = 'name'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'fields'
            AND column_name = 'venue_name'
        ) THEN
          ALTER TABLE "fields" RENAME COLUMN "name" TO "venue_name";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      'ALTER TABLE "fields" ADD COLUMN IF NOT EXISTS "field_name" character varying',
    );
    await queryRunner.query(
      'ALTER TABLE "fields" ADD COLUMN IF NOT EXISTS "player_capacity" integer',
    );

    await queryRunner.query(`
      UPDATE "fields"
      SET "field_name" = COALESCE(NULLIF(BTRIM("field_name"), ''), BTRIM("venue_name"))
      WHERE "field_name" IS NULL OR BTRIM("field_name") = ''
    `);
    await queryRunner.query(
      'UPDATE "fields" SET "player_capacity" = 20 WHERE "player_capacity" IS NULL',
    );

    await queryRunner.query(
      'ALTER TABLE "fields" ALTER COLUMN "field_name" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "fields" ALTER COLUMN "player_capacity" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "fields" ALTER COLUMN "player_capacity" SET DEFAULT 20',
    );

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_fields_owner_id_name"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_fields_owner_lower_name_unique"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_fields_owner_id_venue_name"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_fields_owner_id_field_name"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_fields_owner_id_venue_name_field_name"',
    );
    await queryRunner.query(
      'ALTER TABLE "fields" DROP CONSTRAINT IF EXISTS "UQ_fields_owner_name"',
    );

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fields_owner_id_venue_name_field_name" ON "fields" ("owner_id", LOWER("venue_name"), LOWER("field_name"))',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_fields_owner_id_venue_name_field_name"',
    );
    await queryRunner.query(
      'ALTER TABLE "fields" DROP COLUMN IF EXISTS "player_capacity"',
    );
    await queryRunner.query(
      'ALTER TABLE "fields" DROP COLUMN IF EXISTS "field_name"',
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'fields'
            AND column_name = 'venue_name'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'fields'
            AND column_name = 'name'
        ) THEN
          ALTER TABLE "fields" RENAME COLUMN "venue_name" TO "name";
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
          WHERE conname = 'UQ_fields_owner_name'
            AND conrelid = 'public.fields'::regclass
        ) THEN
          ALTER TABLE "fields"
          ADD CONSTRAINT "UQ_fields_owner_name" UNIQUE ("owner_id", "name");
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fields_owner_lower_name_unique" ON "fields" ("owner_id", LOWER("name"))',
    );
  }
}
