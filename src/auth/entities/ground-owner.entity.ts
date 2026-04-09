import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Field } from "../../fields/entities/field.entity";

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

  @OneToMany(() => Field, (field) => field.owner)
  fields?: Field[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
