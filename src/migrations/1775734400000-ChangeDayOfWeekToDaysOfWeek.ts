import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeDayOfWeekToDaysOfWeek1775734400000 implements MigrationInterface {
  name = "ChangeDayOfWeekToDaysOfWeek1775734400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add new column with default '' (simple-array expects string)
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN "days_of_week" text DEFAULT '';
    `);
    // 2. Copy data from day_of_week to days_of_week as a string (e.g., '5' -> '5')
    await queryRunner.query(`
      UPDATE "membership_plans" SET "days_of_week" = CASE WHEN "day_of_week" IS NOT NULL THEN "day_of_week"::text ELSE '' END;
    `);
    // 3. Set NOT NULL
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ALTER COLUMN "days_of_week" SET NOT NULL;
    `);
    // 4. Drop old column
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      DROP COLUMN "day_of_week";
    `);
    // 5. Drop default
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ALTER COLUMN "days_of_week" DROP DEFAULT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      DROP COLUMN "days_of_week";
    `);
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN "day_of_week" int;
    `);
  }
}
