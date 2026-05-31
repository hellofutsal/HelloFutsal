import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddEndDateToMembershipPlans1780000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "membership_plans",
      new TableColumn({
        name: "end_date",
        type: "date",
        isNullable: true,
        comment:
          "End date of membership. After this date, the membership will be inactive.",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("membership_plans", "end_date");
  }
}
