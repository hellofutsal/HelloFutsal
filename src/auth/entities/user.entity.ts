import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "users" })
export class UserAccount {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true, nullable: true })
  username?: string;

  @Column({ name: "full_name", nullable: true })
  name?: string;

  @Column({ unique: true, nullable: true })
  email?: string;

  @Column({ name: "mobile_number", unique: true, nullable: true })
  mobileNumber?: string;

  @Column({ name: "password_hash", type: "varchar", nullable: true })
  passwordHash?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @Column({ name: "onboarding_number", type: "int", default: 0 })
  onboardingNumber!: number;

  @Column({ name: "onboarding_complete", type: "boolean", default: false })
  onboardingComplete!: boolean;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
