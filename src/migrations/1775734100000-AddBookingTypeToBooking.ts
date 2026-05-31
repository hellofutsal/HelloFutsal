import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBookingTypeToBooking1775734100000 implements MigrationInterface {
  name = "AddBookingTypeToBooking1775734100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD COLUMN "booking_type" varchar NOT NULL DEFAULT 'normal';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings" DROP COLUMN "booking_type";
    `);
  }
}
