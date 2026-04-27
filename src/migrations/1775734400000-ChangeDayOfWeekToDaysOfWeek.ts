import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeDayOfWeekToDaysOfWeek1775734400000 implements MigrationInterface {
  name = "ChangeDayOfWeekToDaysOfWeek1775734400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Abort if any invalid day_of_week values exist
    const invalid = await queryRunner.query(
      `SELECT array_agg("day_of_week") as invalids FROM "membership_plans" WHERE "day_of_week" IS NOT NULL AND "day_of_week" NOT IN (0,1,2,3,4,5,6);`,
    );
    if (
      invalid &&
      invalid[0] &&
      invalid[0].invalids &&
      invalid[0].invalids.length > 0
    ) {
      throw new Error(
        `Invalid day_of_week value(s) found in membership_plans: ${invalid[0].invalids}`,
      );
    }
    // 1. Add new column with default '' (simple-array expects string)
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN "days_of_week" text DEFAULT '';
    `);
    // 2. Map day_of_week ints to weekday names for days_of_week
    await queryRunner.query(`
      UPDATE "membership_plans" SET "days_of_week" = CASE 
        WHEN "day_of_week" = 0 THEN 'sunday'
        WHEN "day_of_week" = 1 THEN 'monday'
        WHEN "day_of_week" = 2 THEN 'tuesday'
        WHEN "day_of_week" = 3 THEN 'wednesday'
        WHEN "day_of_week" = 4 THEN 'thursday'
        WHEN "day_of_week" = 5 THEN 'friday'
        WHEN "day_of_week" = 6 THEN 'saturday'
        ELSE '' END;
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
    throw new Error(
      "Irreversible migration: cannot safely restore day_of_week from days_of_week.",
    );
  }
}
