import { MigrationInterface, QueryRunner } from "typeorm";

export class UsernameAndAdminOnboardingFields1743810000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" character varying',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_username_unique" ON "users" ("username")',
    );

    await queryRunner.query(
      'ALTER TABLE "user_signup_otp_requests" ADD COLUMN IF NOT EXISTS "username" character varying',
    );

    await queryRunner.query(
      'ALTER TABLE "admins" ALTER COLUMN "ground_name" DROP NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "admins" SET "ground_name" = 'Unassigned' WHERE "ground_name" IS NULL`,
    );

    await queryRunner.query(
      'ALTER TABLE "admins" ALTER COLUMN "ground_name" SET NOT NULL',
    );

    await queryRunner.query(
      'ALTER TABLE "user_signup_otp_requests" DROP COLUMN IF EXISTS "username"',
    );

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_username_unique"');
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "username"',
    );
  }
}
