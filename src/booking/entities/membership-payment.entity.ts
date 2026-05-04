import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserAccount } from "../../auth/entities/user.entity";
import { Field } from "../../fields/entities/field.entity";
import { MembershipPlan } from "./membership-plan.entity";

export type MembershipPaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded";

@Entity({ name: "membership_payments" })
export class MembershipPayment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "membership_plan_id", type: "uuid" })
  membershipPlanId!: string;

  @ManyToOne(() => MembershipPlan, { onDelete: "CASCADE" })
  @JoinColumn({ name: "membership_plan_id" })
  membershipPlan!: MembershipPlan;

  @Column({ name: "field_id", type: "uuid" })
  fieldId!: string;

  @ManyToOne(() => Field, { onDelete: "CASCADE" })
  @JoinColumn({ name: "field_id" })
  field!: Field;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserAccount, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserAccount;

  @Column({ name: "period_start_date", type: "date" })
  periodStartDate!: string;

  @Column({ name: "period_end_date", type: "date" })
  periodEndDate!: string;

  @Column({ name: "payment_status", type: "varchar", default: "pending" })
  paymentStatus!: MembershipPaymentStatus;

  @Column({
    name: "total_amount",
    type: "numeric",
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalAmount!: string;

  @Column({
    name: "confirmed_slot_ids",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  confirmedSlotIds!: string[];

  @Column({
    name: "confirmed_booking_ids",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  confirmedBookingIds!: string[];

  @Column({ name: "confirmed_count", type: "integer", default: 0 })
  confirmedCount!: number;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
