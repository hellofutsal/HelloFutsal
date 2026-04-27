import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeDayOfWeekToDaysOfWeek1775734400000 implements MigrationInterface {
  name = "ChangeDayOfWeekToDaysOfWeek1775734400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      DROP COLUMN "day_of_week";
    `);
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN "days_of_week" text;
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
