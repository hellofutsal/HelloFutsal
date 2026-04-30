import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { UserAccount } from '../../auth/entities/user.entity';

@Entity('fcm_tokens')
export class FcmToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  token!: string;

  @Column({ nullable: true })
  deviceType?: string; // 'web', 'ios', 'android'

  @Column({ nullable: true })
  deviceInfo?: string; // User agent or device identifier

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: true })
  lastUsedAt?: Date;

  @ManyToOne(() => UserAccount)
  @JoinColumn({ name: 'userId' })
  user!: UserAccount;

  @Column()
  userId!: string;
}
