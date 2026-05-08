import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from "typeorm";

export class CreateMembershipPricingHistory1780000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "membership_pricing_history",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "gen_random_uuid()",
          },
          {
            name: "membership_plan_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "effective_from_date",
            type: "date",
            isNullable: false,
            comment: "The date from which this price is effective",
          },
          {
            name: "per_slot_price",
            type: "numeric",
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
        indices: [
          {
            name: "idx_membership_pricing_plan_date",
            columnNames: ["membership_plan_id", "effective_from_date"],
          },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      "membership_pricing_history",
      new TableForeignKey({
        columnNames: ["membership_plan_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "membership_plans",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("membership_pricing_history");
    const foreignKey = table?.foreignKeys.find((fk) =>
      fk.columnNames.includes("membership_plan_id"),
    );

    if (foreignKey) {
      await queryRunner.dropForeignKey(
        "membership_pricing_history",
        foreignKey,
      );
    }

    await queryRunner.dropTable("membership_pricing_history", true);
  }
}
