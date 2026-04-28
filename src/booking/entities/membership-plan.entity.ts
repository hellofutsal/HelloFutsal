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

@Entity({ name: "membership_plans" })
export class MembershipPlan {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_name", type: "varchar", length: 120 })
  userName!: string;

  @Column({ name: "phone_number", type: "varchar", length: 20 })
  phoneNumber!: string;

  @ManyToOne(() => UserAccount, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserAccount;

  @ManyToOne(() => Field, { onDelete: "CASCADE" })
  @JoinColumn({ name: "field_id" })
  field!: Field;

  @Column({ name: "days_of_week", type: "simple-array" })
  daysOfWeek!: string[]; // e.g., ["sunday", "friday"]

  @Column({ name: "start_time", type: "time" })
  startTime!: string;

  @Column({ name: "end_time", type: "time" })
  endTime!: string;

  /**
   * Start date from which this membership plan becomes active.
   * Before this date, the membership plan will not book slots.
   */
  @Column({ name: "start_date", type: "date" })
  startDate!: string;

  /**
   * Monthly price charged for this membership plan.
   * The per-slot price is computed as: monthlyPrice / 30
   */
  @Column({
    name: "monthly_price",
    type: "numeric",
    precision: 12,
    scale: 2,
    default: 0,
  })
  monthlyPrice!: string;

  @Column({ name: "active", type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
