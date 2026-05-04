import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveMembershipStatusFromMembershipPlans1775750000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" DROP COLUMN "membership_status"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" ADD "membership_status" varchar(50) NOT NULL DEFAULT 'active'`,
    );
  }
}
