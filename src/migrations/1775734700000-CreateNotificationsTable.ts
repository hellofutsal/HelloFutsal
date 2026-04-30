import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateNotificationsTable1775734700000 implements MigrationInterface {
  name = "CreateNotificationsTable1775734700000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if notifications table exists
    const notificationsTableExists = await queryRunner.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'notifications'
    `);
    
    if (notificationsTableExists.length === 0) {
      await queryRunner.query(`
        CREATE TABLE "notifications" (
          "id" uuid NOT NULL DEFAULT gen_random_uuid(),
          "type" character varying NOT NULL,
          "title" character varying NOT NULL,
          "body" text NOT NULL,
          "data" json,
          "status" character varying NOT NULL DEFAULT 'pending',
          "fcmToken" character varying,
          "errorMessage" character varying,
          "firebaseMessageId" character varying,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "readAt" TIMESTAMP,
          "userId" uuid,
          CONSTRAINT "PK_7fb1c6b71d5c4d1d1e1e1e1e1e1e" PRIMARY KEY ("id")
        )
      `);
    }

    // Check if fcm_tokens table exists
    const fcmTokensTableExists = await queryRunner.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'fcm_tokens'
    `);
    
    if (fcmTokensTableExists.length === 0) {
      await queryRunner.query(`
        CREATE TABLE "fcm_tokens" (
          "id" uuid NOT NULL DEFAULT gen_random_uuid(),
          "token" character varying NOT NULL,
          "deviceType" character varying,
          "deviceInfo" character varying,
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "lastUsedAt" TIMESTAMP,
          "userId" uuid NOT NULL,
          CONSTRAINT "PK_fcm_tokens" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_fcm_tokens_token" UNIQUE ("token")
        )
      `);
    }

    // Add foreign key constraints if they don't exist
    const notificationsFkExists = await queryRunner.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_schema = 'public' AND table_name = 'notifications' AND constraint_name = 'FK_notifications_user'
    `);

    if (notificationsFkExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "notifications" 
        ADD CONSTRAINT "FK_notifications_user" 
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      `);
    }

    const fcmTokensFkExists = await queryRunner.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_schema = 'public' AND table_name = 'fcm_tokens' AND constraint_name = 'FK_fcm_tokens_user'
    `);

    if (fcmTokensFkExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "fcm_tokens" 
        ADD CONSTRAINT "FK_fcm_tokens_user" 
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      `);
    }

    // Create indexes for better performance
    const notificationsUserIdIndexExists = await queryRunner.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename = 'notifications' AND indexname = 'IDX_notifications_userId'
    `);

    if (notificationsUserIdIndexExists.length === 0) {
      await queryRunner.query(`
        CREATE INDEX "IDX_notifications_userId" ON "notifications" ("userId")
      `);
    }

    const fcmTokensUserIdIndexExists = await queryRunner.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename = 'fcm_tokens' AND indexname = 'IDX_fcm_tokens_userId'
    `);

    if (fcmTokensUserIdIndexExists.length === 0) {
      await queryRunner.query(`
        CREATE INDEX "IDX_fcm_tokens_userId" ON "fcm_tokens" ("userId")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fcm_tokens_userId"`);

    // Drop foreign key constraints
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "FK_notifications_user"`);
    await queryRunner.query(`ALTER TABLE "fcm_tokens" DROP CONSTRAINT IF EXISTS "FK_fcm_tokens_user"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fcm_tokens"`);
  }
}
