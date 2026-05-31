import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddSlotIdToMembershipPayments1775735000000 implements MigrationInterface {
  name = "AddSlotIdToMembershipPayments1775735000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "membership_payments",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "membership_plan_id",
            type: "uuid",
          },
          {
            name: "field_id",
            type: "uuid",
          },
          {
            name: "user_id",
            type: "uuid",
          },
          {
            name: "period_start_date",
            type: "date",
          },
          {
            name: "period_end_date",
            type: "date",
          },
          {
            name: "payment_status",
            type: "varchar",
            default: "'pending'",
          },
          {
            name: "total_amount",
            type: "numeric",
            precision: 12,
            scale: 2,
            default: 0,
          },
          {
            name: "confirmed_slot_ids",
            type: "jsonb",
            default: "'[]'::jsonb",
          },
          {
            name: "confirmed_booking_ids",
            type: "jsonb",
            default: "'[]'::jsonb",
          },
          {
            name: "confirmed_count",
            type: "integer",
            default: 0,
          },
          {
            name: "paid_at",
            type: "timestamptz",
            isNullable: true,
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "now()",
          },
          {
            name: "updated_at",
            type: "timestamptz",
            default: "now()",
          },
        ],
        foreignKeys: [
          {
            columnNames: ["membership_plan_id"],
            referencedTableName: "membership_plans",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
          {
            columnNames: ["field_id"],
            referencedTableName: "fields",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
          {
            columnNames: ["user_id"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
        ],
      }),
      true,
    );

    await queryRunner.query(
      `ALTER TABLE "membership_payments" ADD COLUMN IF NOT EXISTS "slot_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "membership_payments" ADD CONSTRAINT "FK_membership_payments_slot_id_field_slots" FOREIGN KEY ("slot_id") REFERENCES "field_slots"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_payments" DROP CONSTRAINT IF EXISTS "FK_membership_payments_slot_id_field_slots"`,
    );
    await queryRunner.query(
      `ALTER TABLE "membership_payments" DROP COLUMN IF EXISTS "slot_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "membership_payments"`);
  }
}
