import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { TournamentBooking } from "./tournament-booking.entity";

export type PaymentMethod = "cash" | "bank_transfer" | "online";

@Entity({ name: "tournament_payments" })
export class TournamentPayment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tournament_id", type: "uuid" })
  tournamentId!: string;

  @ManyToOne(() => TournamentBooking, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tournament_id" })
  tournament!: TournamentBooking;

  @Column({ name: "amount", type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @Column({ name: "method", type: "varchar" })
  method!: PaymentMethod;

  @Column({ name: "note", type: "text", nullable: true })
  note?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
