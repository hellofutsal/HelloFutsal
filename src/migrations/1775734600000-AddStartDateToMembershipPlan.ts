import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStartDateToMembershipPlan1775734600000 implements MigrationInterface {
  name = "AddStartDateToMembershipPlan1775734600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" ADD COLUMN "start_date" date NOT NULL DEFAULT '2026-01-01'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" DROP COLUMN "start_date"`,
    );
  }
}
