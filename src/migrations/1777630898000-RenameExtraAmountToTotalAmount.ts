import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameExtraAmountToTotalAmount1777630898000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings"
      RENAME COLUMN "extra_amount" TO "total_amount"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings"
      RENAME COLUMN "total_amount" TO "extra_amount"
    `);
  }
}
