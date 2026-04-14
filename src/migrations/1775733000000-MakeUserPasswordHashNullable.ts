import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeUserPasswordHashNullable1775733000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE "users" SET "password_hash" = \'pending-password-setup\' WHERE "password_hash" IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL',
    );
  }
}
