import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMobileNumberToGroundOwnersAndSignupOtpRequests1775714400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "admins" ALTER COLUMN "email" DROP NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "mobile_number" character varying',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_admins_mobile_number" ON "admins" ("mobile_number")',
    );

    await queryRunner.query(
      'ALTER TABLE "signup_otp_requests" ADD COLUMN IF NOT EXISTS "mobile_number" character varying',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "admins" ALTER COLUMN "email" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "signup_otp_requests" DROP COLUMN IF EXISTS "mobile_number"',
    );

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_admins_mobile_number"');
    await queryRunner.query(
      'ALTER TABLE "admins" DROP COLUMN IF EXISTS "mobile_number"',
    );
  }
}
