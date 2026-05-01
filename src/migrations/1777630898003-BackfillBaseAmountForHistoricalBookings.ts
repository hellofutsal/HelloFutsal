import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillBaseAmountForHistoricalBookings1777630898003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill base_amount for existing bookings by joining with slots table
    await queryRunner.query(`
      UPDATE bookings 
      SET base_amount = slots.price::numeric
      FROM slots
      WHERE bookings.slot_id = slots.id 
        AND (bookings.base_amount IS NULL OR bookings.base_amount = 0)
        AND bookings.status = 'completed'
    `);

    // Verification query to confirm the update
    const result = await queryRunner.query(`
      SELECT COUNT(*) as updated_count
      FROM bookings
      WHERE base_amount > 0 
        AND status = 'completed'
    `);
    
    console.log(`Backfilled base_amount for ${result[0]?.updated_count || 0} completed bookings`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reversible: Set base_amount back to 0 for records that were updated
    // Note: This only affects records that had base_amount = 0 or NULL before the migration
    await queryRunner.query(`
      UPDATE bookings 
      SET base_amount = 0
      WHERE base_amount > 0 
        AND id IN (
          SELECT bookings.id 
          FROM bookings
          INNER JOIN slots ON bookings.slot_id = slots.id
          WHERE bookings.base_amount = slots.price::numeric
            AND bookings.status = 'completed'
        )
    `);
  }
}
