import { MigrationInterface, QueryRunner } from "typeorm";

export class FieldsCaseInsensitiveNameUnique1775710800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE "fields" SET "name" = BTRIM("name") WHERE "name" IS NOT NULL',
    );

    await queryRunner.query(
      'UPDATE "fields" SET "city" = NULLIF(BTRIM("city"), \'\') WHERE "city" IS NOT NULL',
    );

    await queryRunner.query(
      'UPDATE "fields" SET "address" = NULLIF(BTRIM("address"), \'\') WHERE "address" IS NOT NULL',
    );

    await queryRunner.query(
      'UPDATE "fields" SET "description" = NULLIF(BTRIM("description"), \'\') WHERE "description" IS NOT NULL',
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM (
            SELECT "owner_id", LOWER("name") AS normalized_name, COUNT(*)
            FROM "fields"
            GROUP BY "owner_id", LOWER("name")
            HAVING COUNT(*) > 1
          ) duplicates
        ) THEN
          RAISE EXCEPTION 'Duplicate field names (case-insensitive) exist for same owner';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fields_owner_lower_name_unique" ON "fields" ("owner_id", LOWER("name"))',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_fields_owner_lower_name_unique"',
    );
  }
}
