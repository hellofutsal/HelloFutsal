import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export type TournamentStatus = "confirmed" | "completed" | "cancelled";

@Entity({ name: "tournament_bookings" })
@Index(["organizerPhone"])
export class TournamentBooking {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

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
