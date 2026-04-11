import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import {
  RuleBookActionType,
  RuleBookSlotSelectionType,
} from "../dto/create-field-rule-book.dto";
import { Field } from "./field.entity";

@Entity({ name: "field_rule_books" })
@Index(["fieldId"])
@Index(["fieldId", "ruleName"], { unique: true })
export class FieldRuleBook {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "field_id", type: "uuid" })
  fieldId!: string;

  @ManyToOne(() => Field, (field) => field.ruleBooks, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "field_id" })
  field!: Field;

  @Column({ name: "rule_name", type: "varchar" })
  ruleName!: string;

  @Column({ name: "slot_selection_type", type: "varchar" })
  slotSelectionType!: RuleBookSlotSelectionType;

  @Column({ name: "action_type", type: "varchar" })
  actionType!: RuleBookActionType;

  @Column({ name: "value", type: "numeric", precision: 12, scale: 2 })
  value!: string;

  @Column({ name: "rule_config", type: "jsonb" })
  ruleConfig!: Record<string, unknown>;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
