import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOnboardingFieldsToAdmins1743768000001 implements MigrationInterface {
  name = "AddOnboardingFieldsToAdmins1743768000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admins" ADD "onboarding_number" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "admins" ADD "onboarding_complete" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admins" DROP COLUMN "onboarding_complete"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admins" DROP COLUMN "onboarding_number"`,
    );
  }
}
