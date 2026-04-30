import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMembershipPlans1775734000000 implements MigrationInterface {
  name = "CreateMembershipPlans1775734000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "membership_plans" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "field_id" uuid NOT NULL,
        "day_of_week" int NOT NULL,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_membership_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_membership_field" FOREIGN KEY ("field_id") REFERENCES "fields" ("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "membership_plans"
    `);
  }
}
