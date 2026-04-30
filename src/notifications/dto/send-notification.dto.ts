import { IsString, IsNotEmpty, IsOptional, IsObject, IsEnum } from 'class-validator';
import { NotificationType } from '../entities/notification.entity';

export class SendNotificationDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;
}
