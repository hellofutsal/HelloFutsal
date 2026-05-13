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

    await queryRunner.query(`
      UPDATE field_rule_book_history history
      SET
        rule_name = COALESCE(history.rule_name, rule_book.rule_name),
        slot_selection_type = COALESCE(history.slot_selection_type, rule_book.slot_selection_type),
        action_type = COALESCE(history.action_type, rule_book.action_type),
        value = COALESCE(history.value, rule_book.value)
      FROM field_rule_books rule_book
      WHERE history.rule_book_id = rule_book.id
        AND (
          history.rule_name IS NULL
          OR history.slot_selection_type IS NULL
          OR history.action_type IS NULL
          OR history.value IS NULL
        )
    `);

    await queryRunner.query(`
      ALTER TABLE field_rule_book_history
      ALTER COLUMN rule_name SET NOT NULL,
      ALTER COLUMN slot_selection_type SET NOT NULL,
      ALTER COLUMN action_type SET NOT NULL,
      ALTER COLUMN value SET NOT NULL
    `);
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
