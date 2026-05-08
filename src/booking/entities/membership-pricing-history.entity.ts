import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { MembershipPlan } from "./membership-plan.entity";

@Entity({ name: "membership_pricing_history" })
@Index(["membershipPlanId", "effectiveFromDate"])
export class MembershipPricingHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "membership_plan_id", type: "uuid" })
  membershipPlanId!: string;

  @ManyToOne(() => MembershipPlan, { onDelete: "CASCADE" })
  @JoinColumn({ name: "membership_plan_id" })
  membershipPlan!: MembershipPlan;

  @Column({ name: "effective_from_date", type: "date" })
  effectiveFromDate!: string; // YYYY-MM-DD format

  @Column({
    name: "per_slot_price",
    type: "numeric",
    precision: 12,
    scale: 2,
  })
  perSlotPrice!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
