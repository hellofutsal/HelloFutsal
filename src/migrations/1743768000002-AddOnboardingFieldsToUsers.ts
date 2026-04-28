import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOnboardingFieldsToUsers1743768000002 implements MigrationInterface {
  name = "AddOnboardingFieldsToUsers1743768000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "onboarding_number" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "onboarding_complete" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "onboarding_complete"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "onboarding_number"`,
    );
  }
}
