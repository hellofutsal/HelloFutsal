import { MigrationInterface, QueryRunner } from "typeorm";

export class ConsolidateSignupOtpRequests1743820000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "user_signup_otp_requests"');
    await queryRunner.query('DROP TABLE IF EXISTS "admin_signup_otp_requests"');

    await queryRunner.query(`
      CREATE TABLE "signup_otp_requests" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "identifier" character varying NOT NULL,
        "identifier_type" character varying NOT NULL,
        "account_type" character varying NOT NULL,
        "display_name" character varying,
        "password_hash" character varying NOT NULL,
        "otp_hash" character varying NOT NULL,
        "raw_otp" character varying,
        "expires_at" TIMESTAMP NOT NULL,
        "attempts" integer DEFAULT 0,
        "created_at" TIMESTAMP DEFAULT now(),
        "updated_at" TIMESTAMP DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_signup_otp_requests_identifier_account_type" 
      ON "signup_otp_requests" ("identifier", "account_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_signup_otp_requests_identifier_account_type"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "signup_otp_requests"');
  }
}
