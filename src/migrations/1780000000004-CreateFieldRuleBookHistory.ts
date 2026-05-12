import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from "typeorm";

export class CreateFieldRuleBookHistory1780000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "field_rule_book_history",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          { name: "rule_book_id", type: "uuid", isNullable: false },
          { name: "effective_from_date", type: "date", isNullable: false },
          { name: "rule_config", type: "jsonb", isNullable: false },
          { name: "is_active", type: "boolean", default: true },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
        indices: [
          {
            name: "idx_field_rule_book_history_rule_date",
            columnNames: ["rule_book_id", "effective_from_date"],
            isUnique: true,
          },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      "field_rule_book_history",
      new TableForeignKey({
        columnNames: ["rule_book_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "field_rule_books",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("field_rule_book_history");
    const foreignKey = table?.foreignKeys.find((fk) =>
      fk.columnNames.includes("rule_book_id"),
    );
    if (foreignKey)
      await queryRunner.dropForeignKey("field_rule_book_history", foreignKey);
    await queryRunner.dropTable("field_rule_book_history", true);
  }
}
