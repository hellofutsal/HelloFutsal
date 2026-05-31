import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { UserAccount } from "../../auth/entities/user.entity";
import { Field } from "../../fields/entities/field.entity";
import { FieldSlot } from "../../fields/entities/field-slot.entity";

@Entity({ name: "cancelled_bookings" })
export class CancelledBooking {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "original_booking_id", type: "uuid", nullable: true })
  originalBookingId?: string;

  @Column({ name: "field_id", type: "uuid", nullable: true })
  fieldId!: string | null;

  @ManyToOne(() => Field, { onDelete: "SET NULL" })
  @JoinColumn({ name: "field_id" })
  field?: Field | null;

  @Column({ name: "slot_id", type: "uuid", nullable: true })
  slotId!: string | null;

  @ManyToOne(() => FieldSlot, { onDelete: "SET NULL" })
  @JoinColumn({ name: "slot_id" })
  slot?: FieldSlot | null;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId!: string | null;

  @ManyToOne(() => UserAccount, { onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user?: UserAccount | null;

  @Column({ name: "booking_type", type: "varchar", nullable: true })
  bookingType?: string;

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

  @Column({ name: "discount", type: "boolean", default: false })
  discount!: boolean;

  @Column({
    name: "extra_amount",
    type: "numeric",
    precision: 12,
    scale: 2,
    default: 0,
  })
  extraAmount!: string;

  @Column({
    name: "discount_amount",
    type: "numeric",
    precision: 12,
    scale: 2,
    default: 0,
  })
  discountAmount!: string;

  @Column({ name: "selected_inventory", type: "jsonb", nullable: true })
  selectedInventory?: Array<{
    name: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }> | null;

  @Column({ name: "created_at", type: "timestamp" })
  createdAt!: Date;

  @Column({ name: "cancelled_at", type: "timestamptz", default: () => "now()" })
  cancelledAt!: Date;

  @Column({ name: "cancelled_by", type: "uuid", nullable: true })
  cancelledBy?: string;
}
