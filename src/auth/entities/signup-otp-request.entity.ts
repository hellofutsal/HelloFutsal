import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "signup_otp_requests" })
@Index(["identifier", "accountType"], { unique: true })
export class SignupOtpRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  identifier!: string;

  @Column({ name: "identifier_type" })
  identifierType!: "email" | "mobile";

  @Column({ name: "account_type" })
  accountType!: "user" | "admin";

  @Column({ name: "display_name", nullable: true })
  displayName?: string;

  @Column({ name: "mobile_number", nullable: true })
  mobileNumber?: string;

  @Column({ name: "password_hash" })
  passwordHash!: string;

  @Column({ name: "otp_hash" })
  otpHash!: string;

  @Column({ name: "raw_otp", type: "varchar", nullable: true })
  rawOtp?: string | null;

  @Column({ name: "expires_at", type: "timestamp" })
  expiresAt!: Date;

  @Column({ name: "attempts", default: 0 })
  attempts!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
