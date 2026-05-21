import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Field } from "../../fields/entities/field.entity";

export type TournamentStatus = "confirmed" | "completed" | "cancelled";

@Entity({ name: "tournament_bookings" })
@Index(["organizerPhone"])
@Index(["fieldId"])
export class TournamentBooking {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "field_id", type: "uuid", nullable: true })
  fieldId?: string | null;

  @ManyToOne(() => Field, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "field_id" })
  field?: Field | null;

  @Column({ name: "organizer_name", type: "varchar" })
  organizerName!: string;

  @Column({ name: "organizer_phone", type: "varchar", nullable: true })
  organizerPhone?: string;

  @Column({ name: "event_name", type: "varchar" })
  eventName!: string;

  @Column({ name: "start_at", type: "timestamptz" })
  startAt!: Date;

  @Column({ name: "end_at", type: "timestamptz" })
  endAt!: Date;

  @Column({ name: "courts", type: "jsonb", default: [] })
  courts!: string[];

  @Column({
    name: "total_amount",
    type: "numeric",
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalAmount!: string;

  @Column({
    name: "advance_paid",
    type: "numeric",
    precision: 12,
    scale: 2,
    default: 0,
  })
  advancePaid!: string;

  @Column({ name: "notes", type: "text", nullable: true })
  notes?: string;

  @Column({ name: "status", type: "varchar", default: "confirmed" })
  status!: TournamentStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
