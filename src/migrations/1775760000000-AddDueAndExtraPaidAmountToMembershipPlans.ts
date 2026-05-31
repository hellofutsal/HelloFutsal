import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDueAndExtraPaidAmountToMembershipPlans1775760000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" ADD "due_amount" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "membership_plans" ADD "extra_paid_amount" numeric(12,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" DROP COLUMN "extra_paid_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "membership_plans" DROP COLUMN "due_amount"`,
    );
  }
}
