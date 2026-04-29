import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStartDateToMembershipPlan1775734600000 implements MigrationInterface {
  name = "AddStartDateToMembershipPlan1775734600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add column as nullable without default
    await queryRunner.query(
      `ALTER TABLE "membership_plans" ADD COLUMN "start_date" date NULL`,
    );
    
    // 2. Backfill with appropriate values (using created_at as a reasonable default)
    await queryRunner.query(`
      UPDATE "membership_plans" 
      SET "start_date" = CASE 
        WHEN "start_date" IS NULL THEN DATE("created_at")
        ELSE "start_date"
      END
    `);
    
    // 3. Set NOT NULL constraint
    await queryRunner.query(
      `ALTER TABLE "membership_plans" ALTER COLUMN "start_date" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" DROP COLUMN "start_date"`,
    );
  }
}
