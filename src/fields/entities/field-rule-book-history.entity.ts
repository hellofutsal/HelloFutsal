import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { FieldRuleBook } from "./field-rule-book.entity";

@Entity({ name: "field_rule_book_history" })
@Index(["ruleBookId", "effectiveFromDate"], { unique: true })
export class FieldRuleBookHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "rule_book_id", type: "uuid" })
  ruleBookId!: string;

  @ManyToOne(() => FieldRuleBook, { onDelete: "CASCADE" })
  @JoinColumn({ name: "rule_book_id" })
  ruleBook!: FieldRuleBook;

  @Column({ name: "effective_from_date", type: "date" })
  effectiveFromDate!: string; // YYYY-MM-DD

  @Column({ name: "rule_config", type: "jsonb" })
  ruleConfig!: Record<string, unknown>;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
