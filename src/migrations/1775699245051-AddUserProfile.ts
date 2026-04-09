import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserProfile1775699245051 implements MigrationInterface {
  name = "AddUserProfile1775699245051";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_users_mobile_number_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_users_username_unique"`,
    );
    await queryRunner.query(`
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'UQ_fe0bb3f6520ee0469504521e710'
                                AND conrelid = 'public.users'::regclass
                        ) THEN
                            ALTER TABLE "users" ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username");
                        END IF;
                    END
                    $$;
                `);
    await queryRunner.query(`
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'UQ_350c2c34c6fdd4b292ab6e77879'
                                AND conrelid = 'public.users'::regclass
                        ) THEN
                            ALTER TABLE "users" ADD CONSTRAINT "UQ_350c2c34c6fdd4b292ab6e77879" UNIQUE ("mobile_number");
                        END IF;
                    END
                    $$;
                `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_350c2c34c6fdd4b292ab6e77879"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_fe0bb3f6520ee0469504521e710"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_username_unique" ON "users" ("username") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_mobile_number_unique" ON "users" ("mobile_number") `,
    );
  }
}
