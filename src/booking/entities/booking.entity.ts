import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserAccount } from "../../auth/entities/user.entity";
import { Field } from "../../fields/entities/field.entity";
import { FieldSlot } from "../../fields/entities/field-slot.entity";

export type BookingStatus = "booked" | "completed" | "cancelled";
export type BookingType = "normal" | "membership";

@Entity({ name: "bookings" })
@Index(["fieldId"])
@Index(["slotId"], { unique: true })
@Index(["userId"])
export class Booking {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "field_id", type: "uuid" })
  fieldId!: string;

  @ManyToOne(() => Field, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "field_id" })
  field!: Field;

  @Column({ name: "slot_id", type: "uuid" })
  slotId!: string;

  @ManyToOne(() => FieldSlot, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "slot_id" })
  slot!: FieldSlot;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserAccount, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user!: UserAccount;

  @Column({ name: "status", type: "varchar", default: "booked" })
  status!: BookingStatus;

  @Column({ name: "booking_type", type: "varchar", default: "normal" })
  bookingType!: BookingType;

  @Column({ name: "discount", type: "boolean", default: false })
  discount!: boolean;

  @Column({
    name: "base_amount",
    type: "numeric",
    precision: 12,
    scale: 2,
    default: 0,
  })
  baseAmount!: string;

  @Column({
    name: "total_amount",
    type: "numeric",
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalAmount!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
