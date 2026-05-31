import { MigrationInterface, QueryRunner } from "typeorm";

export class AddImageUrlToFields1775734000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "fields" ADD "image_url" text DEFAULT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "fields" DROP COLUMN "image_url"');
  }
}
