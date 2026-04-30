import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMonthlyPriceToMembershipPlan1775734500000
  implements MigrationInterface
{
  name = "AddMonthlyPriceToMembershipPlan1775734500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add column as nullable without default
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN IF NOT EXISTS "monthly_price" numeric(12,2) NULL
    `);
    
    // 2. Backfill with appropriate values (you may need to adjust this logic)
    // For now, we'll set a reasonable default, but this should be based on business logic
    await queryRunner.query(`
      UPDATE "membership_plans" 
      SET "monthly_price" = CASE 
        WHEN "monthly_price" IS NULL THEN 0
        ELSE "monthly_price"
      END
    `);
    
    // 3. Set NOT NULL constraint
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ALTER COLUMN "monthly_price" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      DROP COLUMN IF EXISTS "monthly_price"
    `);
  }
}
