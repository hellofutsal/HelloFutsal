import { MigrationInterface, QueryRunner } from "typeorm";

export class UserEmailOrMobile1743779700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "full_name" DROP NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mobile_number" character varying',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_mobile_number_unique" ON "users" ("mobile_number")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_users_mobile_number_unique"',
    );
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "mobile_number"',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "full_name" SET NOT NULL',
    );
  }
}
