import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "admins" })
export class GroundOwnerAccount {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "owner_name" })
  ownerName!: string;

  @Column({ name: "ground_name", nullable: true })
  groundName?: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: "password_hash" })
  passwordHash!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
