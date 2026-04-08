import { MigrationInterface, QueryRunner } from "typeorm";

export class RelaxRawOtpAndCleanupBackfill1743827200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "signup_otp_requests" ALTER COLUMN "raw_otp" DROP NOT NULL',
    );

    await queryRunner.query(
      `UPDATE "signup_otp_requests" SET "raw_otp" = NULL WHERE "raw_otp" LIKE '$2%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "signup_otp_requests" SET "raw_otp" = 'UNAVAILABLE' WHERE "raw_otp" IS NULL`,
    );

    await queryRunner.query(
      'ALTER TABLE "signup_otp_requests" ALTER COLUMN "raw_otp" SET NOT NULL',
    );
  }
}
