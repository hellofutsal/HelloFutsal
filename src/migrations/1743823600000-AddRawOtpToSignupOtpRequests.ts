import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRawOtpToSignupOtpRequests1743823600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "signup_otp_requests" ADD COLUMN IF NOT EXISTS "raw_otp" character varying',
    );

    await queryRunner.query(
      'ALTER TABLE "signup_otp_requests" ALTER COLUMN "raw_otp" DROP NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "signup_otp_requests" DROP COLUMN IF EXISTS "raw_otp"',
    );
  }
}
