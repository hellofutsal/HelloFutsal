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
import { Field } from "./field.entity";
import { MembershipPlan } from "../../booking/entities/membership-plan.entity";

export type FieldSlotStatus =
  | "available"
  | "booked"
  | "completed"
  | "blocked"
  | "cancelled";

export type SlotType = "normal" | "membership";

@Entity({ name: "field_slots" })
@Index(["fieldId", "slotDate", "startTime"], { unique: true })
export class FieldSlot {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "field_id", type: "uuid" })
  fieldId!: string;

  @ManyToOne(() => Field, (field) => field.slots, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "field_id" })
  field!: Field;

  @Column({ name: "membership_plan_id", type: "uuid", nullable: true })
  membershipPlanId!: string | null;

  @ManyToOne(() => MembershipPlan, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "membership_plan_id" })
  membershipPlan!: MembershipPlan | null;

  @Column({ name: "slot_date", type: "date" })
  slotDate!: string;

  @Column({ name: "start_time", type: "time" })
  startTime!: string;

  @Column({ name: "end_time", type: "time" })
  endTime!: string;

  @Column({ name: "slot_type", type: "varchar", default: "normal" })
  slotType!: SlotType;

  @Column({ name: "price", type: "numeric", precision: 12, scale: 2 })
  price!: string;

  @Column({ name: "status", type: "varchar", default: "available" })
  status!: FieldSlotStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
