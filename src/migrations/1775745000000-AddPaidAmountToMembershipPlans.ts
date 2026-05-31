import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaidAmountToMembershipPlans1775745000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" ADD "paid_amount" numeric(12,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" DROP COLUMN "paid_amount"`,
    );
  }
}
