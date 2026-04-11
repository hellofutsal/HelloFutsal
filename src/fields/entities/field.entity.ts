import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  OneToMany,
  UpdateDateColumn,
} from "typeorm";
import { GroundOwnerAccount } from "../../auth/entities/ground-owner.entity";
import { FieldScheduleSettings } from "./field-schedule-settings.entity";
import { FieldSlot } from "./field-slot.entity";

@Entity({ name: "fields" })
@Index(["ownerId"])
export class Field {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "owner_id", type: "uuid" })
  ownerId!: string;

  @ManyToOne(() => GroundOwnerAccount, (owner) => owner.fields, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "owner_id" })
  owner!: GroundOwnerAccount;

  @Column({ name: "venue_name", type: "varchar" })
  venueName!: string;

  @Column({ name: "field_name", type: "varchar" })
  fieldName!: string;

  @Column({ name: "player_capacity", type: "integer" })
  playerCapacity!: number;

  @Column({ type: "varchar", nullable: true })
  city?: string;

  @Column({ type: "varchar", nullable: true })
  address?: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @OneToOne(
    () => FieldScheduleSettings,
    (scheduleSettings) => scheduleSettings.field,
  )
  scheduleSettings?: FieldScheduleSettings;

  @OneToMany(() => FieldSlot, (slot) => slot.field)
  slots?: FieldSlot[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
