import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Field } from "./field.entity";

@Entity({ name: "field_schedule_settings" })
export class FieldScheduleSettings {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "field_id", type: "uuid", unique: true })
  fieldId!: string;

  @OneToOne(() => Field, (field) => field.scheduleSettings, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "field_id" })
  field!: Field;

  @Column({ name: "slot_duration_min", type: "integer" })
  slotDurationMin!: number;

  @Column({ name: "break_between_min", type: "integer" })
  breakBetweenMin!: number;

  @Column({ name: "base_price", type: "numeric", precision: 12, scale: 2 })
  basePrice!: string;

  @Column({ name: "opening_time", type: "time" })
  openingTime!: string;

  @Column({ name: "closing_time", type: "time" })
  closingTime!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
