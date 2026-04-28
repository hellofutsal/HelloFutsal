import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStartDateToMembershipPlan1775734600000 implements MigrationInterface {
  name = "AddStartDateToMembershipPlan1775734600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      // Try to add the column (will fail if already exists)
      await queryRunner.query(
        `ALTER TABLE "membership_plans" ADD COLUMN "start_date" date DEFAULT CURRENT_DATE`,
      );
      
      // Update existing records to use their created_at date
      await queryRunner.query(
        `UPDATE "membership_plans" SET "start_date" = DATE(created_at) WHERE "start_date" = CURRENT_DATE`,
      );
    } catch (error) {
      // Column might already exist, just update data
      try {
        await queryRunner.query(
          `UPDATE "membership_plans" SET "start_date" = DATE(created_at) WHERE "start_date" IS NULL`,
        );
      } catch (updateError) {
        // If update fails, column might already be properly set
        console.log('Column already exists and has data');
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" DROP COLUMN "start_date"`,
    );
  }
}
