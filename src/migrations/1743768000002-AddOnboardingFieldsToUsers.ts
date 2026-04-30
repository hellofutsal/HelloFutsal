import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOnboardingFieldsToUsers1743768000002 implements MigrationInterface {
  name = "AddOnboardingFieldsToUsers1743768000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if onboarding_number column exists before adding it
    const onboardingNumberExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'onboarding_number'
    `);
    
    if (onboardingNumberExists.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD "onboarding_number" integer NOT NULL DEFAULT 0`,
      );
    }

    // Check if onboarding_complete column exists before adding it
    const onboardingCompleteExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'onboarding_complete'
    `);
    
    if (onboardingCompleteExists.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD "onboarding_complete" boolean NOT NULL DEFAULT false`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Check if onboarding_complete column exists before dropping it
    const onboardingCompleteExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'onboarding_complete'
    `);
    
    if (onboardingCompleteExists.length > 0) {
      await queryRunner.query(
        `ALTER TABLE "users" DROP COLUMN "onboarding_complete"`,
      );
    }

    // Check if onboarding_number column exists before dropping it
    const onboardingNumberExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'onboarding_number'
    `);
    
    if (onboardingNumberExists.length > 0) {
      await queryRunner.query(
        `ALTER TABLE "users" DROP COLUMN "onboarding_number"`,
      );
    }
  }
}
