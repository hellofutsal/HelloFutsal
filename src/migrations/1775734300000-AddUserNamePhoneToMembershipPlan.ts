import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserNamePhoneToMembershipPlan1775734300000 implements MigrationInterface {
  name = "AddUserNamePhoneToMembershipPlan1775734300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "membership_plans"
      ADD COLUMN "user_name" varchar(120) NOT NULL,
      ADD COLUMN "phone_number" varchar(20) NOT NULL;
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
