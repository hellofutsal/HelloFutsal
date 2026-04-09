import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserProfile1775699245051 implements MigrationInterface {
    name = 'AddUserProfile1775699245051'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_users_mobile_number_unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_username_unique"`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username")`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_350c2c34c6fdd4b292ab6e77879" UNIQUE ("mobile_number")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_350c2c34c6fdd4b292ab6e77879"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_username_unique" ON "users" ("username") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_mobile_number_unique" ON "users" ("mobile_number") `);
    }

}
