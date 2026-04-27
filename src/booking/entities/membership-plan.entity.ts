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

  @ManyToOne(() => UserAccount, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserAccount;

  @ManyToOne(() => Field, { onDelete: "CASCADE" })
  @JoinColumn({ name: "field_id" })
  field!: Field;

  @Column({ name: "day_of_week", type: "int" })
  dayOfWeek!: number; // 0=Sunday, 6=Saturday

  @Column({ name: "start_time", type: "time" })
  startTime!: string;

  @Column({ name: "end_time", type: "time" })
  endTime!: string;

  @Column({ name: "active", type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
