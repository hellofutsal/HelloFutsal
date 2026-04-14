import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeUserPasswordHashNullable1775733000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE "users" SET "password_hash" = \'$2a$12$JnH3pThTdrW8rEj1REpKB.83pyTornQqYfORoZLZIzie6UUoZWvxG\' WHERE "password_hash" IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL',
    );
  }
}
