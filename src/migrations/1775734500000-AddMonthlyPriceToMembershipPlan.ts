import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMonthlyPriceToMembershipPlan1775734500000
  implements MigrationInterface
{
  name = "AddMonthlyPriceToMembershipPlan1775734500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN IF NOT EXISTS "monthly_price" numeric(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      DROP COLUMN IF EXISTS "monthly_price"
    `);
  }
}
