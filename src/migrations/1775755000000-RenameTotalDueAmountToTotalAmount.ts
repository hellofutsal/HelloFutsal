import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameTotalDueAmountToTotalAmount1775755000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" RENAME COLUMN "total_due_amount" TO "total_amount"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" RENAME COLUMN "total_amount" TO "total_due_amount"`,
    );
  }
}
