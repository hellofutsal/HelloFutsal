import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFcmTokensToUsersAndAdmins1777550535853 implements MigrationInterface {
    name = 'AddFcmTokensToUsersAndAdmins1777550535853'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "field_rule_books" DROP CONSTRAINT "FK_field_rule_books_field_id_fields"`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" DROP CONSTRAINT "FK_field_schedule_settings_field_id_fields"`);
        await queryRunner.query(`ALTER TABLE "field_slots" DROP CONSTRAINT "FK_field_slots_field_id_fields"`);
        await queryRunner.query(`ALTER TABLE "fields" DROP CONSTRAINT "FK_fields_owner_id_admins"`);
        await queryRunner.query(`ALTER TABLE "membership_plans" DROP CONSTRAINT "FK_membership_user"`);
        await queryRunner.query(`ALTER TABLE "membership_plans" DROP CONSTRAINT "FK_membership_field"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_field_id"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_slot_id"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fields_owner_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fields_owner_id_venue_name_field_name"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admins_mobile_number"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bookings_field_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bookings_user_id"`);
        await queryRunner.query(`ALTER TABLE "admins" DROP CONSTRAINT "CHK_admins_email_or_mobile_number"`);
        await queryRunner.query(`ALTER TABLE "field_rule_books" DROP CONSTRAINT "UQ_field_rule_books_field_rule_name"`);
        await queryRunner.query(`ALTER TABLE "field_slots" DROP CONSTRAINT "UQ_field_slots_field_date_start_time"`);
        await queryRunner.query(`ALTER TABLE "admins" ADD "fcm_token" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "fcm_token" character varying`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ALTER COLUMN "slot_duration_min" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ALTER COLUMN "break_between_min" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ALTER COLUMN "base_price" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ALTER COLUMN "opening_time" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ALTER COLUMN "closing_time" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "fields" ALTER COLUMN "player_capacity" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "admins" ADD CONSTRAINT "UQ_f2a09f4868722e3328166b772c4" UNIQUE ("mobile_number")`);
        await queryRunner.query(`ALTER TABLE "membership_plans" ALTER COLUMN "start_date" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "membership_plans" ALTER COLUMN "user_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "membership_plans" ALTER COLUMN "field_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "UQ_bookings_slot_id"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b7da6b22b5c6d63f1bc98c3fdd" ON "field_rule_books" ("field_id", "rule_name") `);
        await queryRunner.query(`CREATE INDEX "IDX_2205e54e67b757f2f46b1a70a8" ON "field_rule_books" ("field_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4fc454a2593e41cae3a2bdd12a" ON "field_slots" ("field_id", "slot_date", "start_time") `);
        await queryRunner.query(`CREATE INDEX "IDX_fd7b6f73d3dbe8cb0cc5cd510c" ON "fields" ("owner_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_64cd97487c5c42806458ab5520" ON "bookings" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_409d5b76fb2b0501a8c72dd4ee" ON "bookings" ("slot_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f80ee3c0f6b2adf57520dc9e97" ON "bookings" ("field_id") `);
        await queryRunner.query(`ALTER TABLE "admins" ADD CONSTRAINT "CHK_18b636fd871cb612dcc1036b15" CHECK ("email" IS NOT NULL OR "mobile_number" IS NOT NULL)`);
        await queryRunner.query(`ALTER TABLE "field_rule_books" ADD CONSTRAINT "FK_2205e54e67b757f2f46b1a70a81" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ADD CONSTRAINT "FK_787b5141f3d0ae6db15526dfe3b" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "field_slots" ADD CONSTRAINT "FK_927103913d67e1aeb572aaded31" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fields" ADD CONSTRAINT "FK_fd7b6f73d3dbe8cb0cc5cd510cd" FOREIGN KEY ("owner_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "membership_plans" ADD CONSTRAINT "FK_65b982b6d71486b8a7189634682" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "membership_plans" ADD CONSTRAINT "FK_e0d6fe09ca7bccd6fa0d313fb2e" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_f80ee3c0f6b2adf57520dc9e977" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_409d5b76fb2b0501a8c72dd4eeb" FOREIGN KEY ("slot_id") REFERENCES "field_slots"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_64cd97487c5c42806458ab5520c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_64cd97487c5c42806458ab5520c"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_409d5b76fb2b0501a8c72dd4eeb"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_f80ee3c0f6b2adf57520dc9e977"`);
        await queryRunner.query(`ALTER TABLE "membership_plans" DROP CONSTRAINT "FK_e0d6fe09ca7bccd6fa0d313fb2e"`);
        await queryRunner.query(`ALTER TABLE "membership_plans" DROP CONSTRAINT "FK_65b982b6d71486b8a7189634682"`);
        await queryRunner.query(`ALTER TABLE "fields" DROP CONSTRAINT "FK_fd7b6f73d3dbe8cb0cc5cd510cd"`);
        await queryRunner.query(`ALTER TABLE "field_slots" DROP CONSTRAINT "FK_927103913d67e1aeb572aaded31"`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" DROP CONSTRAINT "FK_787b5141f3d0ae6db15526dfe3b"`);
        await queryRunner.query(`ALTER TABLE "field_rule_books" DROP CONSTRAINT "FK_2205e54e67b757f2f46b1a70a81"`);
        await queryRunner.query(`ALTER TABLE "admins" DROP CONSTRAINT "CHK_18b636fd871cb612dcc1036b15"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f80ee3c0f6b2adf57520dc9e97"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_409d5b76fb2b0501a8c72dd4ee"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_64cd97487c5c42806458ab5520"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fd7b6f73d3dbe8cb0cc5cd510c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4fc454a2593e41cae3a2bdd12a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2205e54e67b757f2f46b1a70a8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b7da6b22b5c6d63f1bc98c3fdd"`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "UQ_bookings_slot_id" UNIQUE ("slot_id")`);
        await queryRunner.query(`ALTER TABLE "membership_plans" ALTER COLUMN "field_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "membership_plans" ALTER COLUMN "user_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "membership_plans" ALTER COLUMN "start_date" SET DEFAULT '2026-01-01'`);
        await queryRunner.query(`ALTER TABLE "admins" DROP CONSTRAINT "UQ_f2a09f4868722e3328166b772c4"`);
        await queryRunner.query(`ALTER TABLE "fields" ALTER COLUMN "player_capacity" SET DEFAULT '20'`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ALTER COLUMN "closing_time" SET DEFAULT '23:00:00'`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ALTER COLUMN "opening_time" SET DEFAULT '06:00:00'`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ALTER COLUMN "base_price" SET DEFAULT 120.00`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ALTER COLUMN "break_between_min" SET DEFAULT '15'`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ALTER COLUMN "slot_duration_min" SET DEFAULT '60'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "fcm_token"`);
        await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "fcm_token"`);
        await queryRunner.query(`ALTER TABLE "field_slots" ADD CONSTRAINT "UQ_field_slots_field_date_start_time" UNIQUE ("field_id", "slot_date", "start_time")`);
        await queryRunner.query(`ALTER TABLE "field_rule_books" ADD CONSTRAINT "UQ_field_rule_books_field_rule_name" UNIQUE ("field_id", "rule_name")`);
        await queryRunner.query(`ALTER TABLE "admins" ADD CONSTRAINT "CHK_admins_email_or_mobile_number" CHECK (((email IS NOT NULL) OR (mobile_number IS NOT NULL)))`);
        await queryRunner.query(`CREATE INDEX "IDX_bookings_user_id" ON "bookings" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_bookings_field_id" ON "bookings" ("field_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_admins_mobile_number" ON "admins" ("mobile_number") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fields_owner_id_venue_name_field_name" ON "fields" ("owner_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_fields_owner_id" ON "fields" ("owner_id") `);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_slot_id" FOREIGN KEY ("slot_id") REFERENCES "field_slots"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_field_id" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "membership_plans" ADD CONSTRAINT "FK_membership_field" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "membership_plans" ADD CONSTRAINT "FK_membership_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fields" ADD CONSTRAINT "FK_fields_owner_id_admins" FOREIGN KEY ("owner_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "field_slots" ADD CONSTRAINT "FK_field_slots_field_id_fields" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "field_schedule_settings" ADD CONSTRAINT "FK_field_schedule_settings_field_id_fields" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "field_rule_books" ADD CONSTRAINT "FK_field_rule_books_field_id_fields" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
