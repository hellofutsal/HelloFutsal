import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddEffectiveDateAndVersionFieldsToRuleBooks1780000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const ruleBooksTable = await queryRunner.getTable("field_rule_books");
    if (!ruleBooksTable?.findColumnByName("effective_date")) {
      await queryRunner.addColumn(
        "field_rule_books",
        new TableColumn({
          name: "effective_date",
          type: "date",
          isNullable: true,
        }),
      );
    }

    const historyTable = await queryRunner.getTable("field_rule_book_history");
    const historyColumns = [
      {
        name: "rule_name",
        type: "varchar",
        isNullable: true,
      },
      {
        name: "slot_selection_type",
        type: "varchar",
        isNullable: true,
      },
      {
        name: "action_type",
        type: "varchar",
        isNullable: true,
      },
      {
        name: "value",
        type: "numeric",
        precision: 12,
        scale: 2,
        isNullable: true,
      },
    ] as const;

    for (const column of historyColumns) {
      if (!historyTable?.findColumnByName(column.name)) {
        await queryRunner.addColumn(
          "field_rule_book_history",
          new TableColumn(column),
        );
      }
    }

    await queryRunner.query(`
      UPDATE field_rule_books
      SET effective_date = COALESCE(effective_date, created_at::date)
      WHERE effective_date IS NULL
    `);

    // Legacy history rows remain nullable. Future inserts should be enforced
    // separately with an insert-time rule or constraint.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const ruleBooksTable = await queryRunner.getTable("field_rule_books");
    if (ruleBooksTable?.findColumnByName("effective_date")) {
      await queryRunner.dropColumn("field_rule_books", "effective_date");
    }

    const historyTable = await queryRunner.getTable("field_rule_book_history");
    for (const columnName of [
      "value",
      "action_type",
      "slot_selection_type",
      "rule_name",
    ]) {
      if (historyTable?.findColumnByName(columnName)) {
        await queryRunner.dropColumn("field_rule_book_history", columnName);
      }
    }
  }
}
