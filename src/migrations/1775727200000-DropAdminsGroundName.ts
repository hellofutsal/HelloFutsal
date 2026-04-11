import { MigrationInterface, QueryRunner } from "typeorm";

export class DropAdminsGroundName1775727200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "admins" DROP COLUMN IF EXISTS "ground_name"',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "ground_name" character varying',
    );
  }
}
