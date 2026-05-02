import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeDaysOfWeekFlexible1777631000000 implements MigrationInterface {
  name = "MakeDaysOfWeekFlexible1777631000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create backup column for rollback capability
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN "days_of_week_old" text,
      ADD COLUMN "start_time_old" time,
      ADD COLUMN "end_time_old" time;
    `);

    // Backup existing values
    await queryRunner.query(`
      UPDATE "membership_plans" 
      SET 
        days_of_week_old = days_of_week,
        start_time_old = start_time,
        end_time_old = end_time;
    `);

    // Transform days_of_week from simple-array (comma-separated string) to JSONB
    // Each day string becomes {"day": "monday", "startTime": "08:00", "endTime": "09:00"}
    await queryRunner.query(`
      UPDATE "membership_plans" 
      SET days_of_week = (
        SELECT jsonb_agg(
          jsonb_build_object(
            'day', day,
            'startTime', start_time,
            'endTime', end_time
          )
        )
        FROM (
          SELECT unnest(string_to_array(days_of_week_old, ',')) as day
        ) AS days
      )
      WHERE days_of_week_old IS NOT NULL;
    `);

    // Change column type from text to jsonb
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ALTER COLUMN days_of_week SET DEFAULT '[]'::jsonb,
      ALTER COLUMN days_of_week TYPE jsonb USING 
        CASE 
          WHEN days_of_week::text = '' THEN '[]'::jsonb
          ELSE days_of_week::jsonb
        END;
    `);

    // Remove old time columns (no longer needed - times are per day now)
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      DROP COLUMN start_time,
      DROP COLUMN end_time;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore old columns
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN start_time time,
      ADD COLUMN end_time time;
    `);

    // Restore from backup (take first day's times as default)
    await queryRunner.query(`
      UPDATE "membership_plans" 
      SET 
        start_time = start_time_old,
        end_time = end_time_old,
        days_of_week = days_of_week_old
      WHERE days_of_week_old IS NOT NULL;
    `);

    // Change days_of_week back to text
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ALTER COLUMN days_of_week TYPE text USING days_of_week::text;
    `);

    // Drop backup columns
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      DROP COLUMN days_of_week_old,
      DROP COLUMN start_time_old,
      DROP COLUMN end_time_old;
    `);
  }
}
