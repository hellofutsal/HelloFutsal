import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from "typeorm";

export class AddMembershipPlanIdToFieldSlots1780000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "field_slots",
      new TableColumn({
        name: "membership_plan_id",
        type: "uuid",
        isNullable: true,
        default: null,
      }),
    );

    await queryRunner.createForeignKey(
      "field_slots",
      new TableForeignKey({
        columnNames: ["membership_plan_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "membership_plans",
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("field_slots");
    const foreignKey = table?.foreignKeys.find((fk) =>
      fk.columnNames.includes("membership_plan_id"),
    );

    if (foreignKey) {
      await queryRunner.dropForeignKey("field_slots", foreignKey);
    }

    await queryRunner.dropColumn("field_slots", "membership_plan_id");
  }
}
