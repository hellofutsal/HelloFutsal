import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { UserAccount } from '../../auth/entities/user.entity';

export enum NotificationType {
  BOOKING_CONFIRMED = 'booking_confirmed',
  BOOKING_CANCELLED = 'booking_cancelled',
  MEMBERSHIP_CREATED = 'membership_created',
  MEMBERSHIP_RENEWED = 'membership_renewed',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  FIELD_REMINDER = 'field_reminder',
  SYSTEM_UPDATE = 'system_update',
  GENERAL = 'general',
}

export enum NotificationStatus {
  SENT = 'sent',
  FAILED = 'failed',
  PENDING = 'pending',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: NotificationType })
  type!: NotificationType;

  @Column()
  title!: string;

  @Column('text')
  body!: string;

  @Column({ type: 'json', nullable: true })
  data?: Record<string, any>;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.PENDING })
  status!: NotificationStatus;

  @Column({ nullable: true })
  fcmToken?: string;

  @Column({ nullable: true })
  errorMessage?: string;

  @Column({ nullable: true })
  firebaseMessageId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: true })
  readAt?: Date;

  @ManyToOne(() => UserAccount, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user?: UserAccount;

  @Column({ nullable: true })
  userId?: string;
}
