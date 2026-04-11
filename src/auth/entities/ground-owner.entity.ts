import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Field } from "../../fields/entities/field.entity";

@Entity({ name: "admins" })
@Check(`"email" IS NOT NULL OR "mobile_number" IS NOT NULL`)
export class GroundOwnerAccount {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "owner_name" })
  ownerName!: string;

  @Column({ unique: true, nullable: true })
  email?: string;

  @Column({ name: "mobile_number", unique: true, nullable: true })
  mobileNumber?: string;

  @Column({ name: "password_hash" })
  passwordHash!: string;

  @OneToMany(() => Field, (field) => field.owner)
  fields?: Field[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
