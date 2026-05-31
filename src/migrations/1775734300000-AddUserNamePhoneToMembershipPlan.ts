import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserNamePhoneToMembershipPlan1775734300000 implements MigrationInterface {
  name = "AddUserNamePhoneToMembershipPlan1775734300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns with safe default
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN "user_name" varchar(120) DEFAULT '';
    `);
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN "phone_number" varchar(20) DEFAULT '';
    `);
    // Optionally backfill here if needed
    // Set NOT NULL
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ALTER COLUMN "user_name" SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ALTER COLUMN "phone_number" SET NOT NULL;
    `);
    // Drop default
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ALTER COLUMN "user_name" DROP DEFAULT;
    `);
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ALTER COLUMN "phone_number" DROP DEFAULT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      DROP COLUMN "user_name",
      DROP COLUMN "phone_number";
    `);
  }
}
