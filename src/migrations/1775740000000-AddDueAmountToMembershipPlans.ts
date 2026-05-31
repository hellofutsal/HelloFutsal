import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddDueAmountToMembershipPlans1775740000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "membership_plans",
      new TableColumn({
        name: "total_due_amount",
        type: "numeric",
        precision: 12,
        scale: 2,
        default: 0,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      "membership_plans",
      new TableColumn({
        name: "membership_status",
        type: "varchar",
        default: "'active'",
        isNullable: false,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("membership_plans", "total_due_amount");
    await queryRunner.dropColumn("membership_plans", "membership_status");
  }
}
