import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Notification, NotificationStatus, NotificationType } from './entities/notification.entity';
import { FcmToken } from './entities/fcm-token.entity';
import { UserAccount } from '../auth/entities/user.entity';
import { SendNotificationDto } from './dto/send-notification.dto';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { FirebaseService } from './firebase.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(FcmToken)
    private readonly fcmTokenRepo: Repository<FcmToken>,
    @InjectRepository(UserAccount)
    private readonly userRepo: Repository<UserAccount>,
    private readonly firebaseService: FirebaseService,
  ) {}

  async sendNotification(dto: SendNotificationDto): Promise<Notification> {
    this.logger.log(`Sending notification: ${dto.title} to user: ${dto.userId || 'specific token'}`);

    // Create notification record
    const notification = this.notificationRepo.create({
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: dto.data,
      status: NotificationStatus.PENDING,
      userId: dto.userId,
      fcmToken: dto.fcmToken,
    });

    const savedNotification = await this.notificationRepo.save(notification);

    // Get FCM token
    let fcmToken = dto.fcmToken;
    if (dto.userId && !fcmToken) {
      const tokens = await this.fcmTokenRepo.find({
        where: { userId: dto.userId, isActive: true },
      });
      fcmToken = tokens[0]?.token; // Use first active token
    }

    if (!fcmToken) {
      this.logger.warn(`No FCM token found for notification ${savedNotification.id}`);
      savedNotification.status = NotificationStatus.FAILED;
      savedNotification.errorMessage = 'No FCM token available';
      return await this.notificationRepo.save(savedNotification);
    }

    // Send via Firebase
    const result = await this.firebaseService.sendNotification(fcmToken, {
      title: dto.title,
      body: dto.body,
      data: dto.data,
    });

    // Update notification status
    if (result.success) {
      savedNotification.status = NotificationStatus.SENT;
      savedNotification.firebaseMessageId = result.messageId;
      savedNotification.fcmToken = fcmToken;
    } else {
      savedNotification.status = NotificationStatus.FAILED;
      savedNotification.errorMessage = result.error;
      
      // If token is invalid, deactivate it
      if (result.error?.includes('not longer valid') || result.error?.includes('Invalid device token')) {
        await this.deactivateToken(fcmToken);
      }
    }

    return await this.notificationRepo.save(savedNotification);
  }

  async sendNotificationToAllUsers(
    title: string,
    body: string,
    type: NotificationType,
    data?: Record<string, any>,
  ): Promise<{ successCount: number; failureCount: number }> {
    this.logger.log(`Sending broadcast notification: ${title}`);

    // Get all active FCM tokens
    const tokens = await this.fcmTokenRepo.find({
      where: { isActive: true },
      relations: ['user'],
    });

    if (tokens.length === 0) {
      this.logger.warn('No active FCM tokens found for broadcast');
      return { successCount: 0, failureCount: 0 };
    }

    const fcmTokens = tokens.map(token => token.token);
    
    // Send multicast notification
    const result = await this.firebaseService.sendMulticastNotification(fcmTokens, {
      title,
      body,
      data,
    });

    // Create notification records for each user
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const response = result.results[i];
      
      const notification = this.notificationRepo.create({
        type,
        title,
        body,
        data,
        status: response.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        userId: token.userId,
        fcmToken: token.token,
        firebaseMessageId: response.messageId,
        errorMessage: response.error?.message,
      });

      await this.notificationRepo.save(notification);

      // Deactivate invalid tokens
      if (!response.success && response.error?.info?.includes('not registered')) {
        await this.deactivateToken(token.token);
      }
    }

    this.logger.log(`Broadcast completed: ${result.successCount} success, ${result.failureCount} failures`);
    
    return {
      successCount: result.successCount,
      failureCount: result.failureCount,
    };
  }

  async registerFcmToken(userId: string, dto: RegisterFcmTokenDto): Promise<FcmToken> {
    this.logger.log(`Registering FCM token for user: ${userId}`);

    // Check if token already exists
    const existingToken = await this.fcmTokenRepo.findOne({
      where: { token: dto.token },
    });

    if (existingToken) {
      // Update existing token
      existingToken.isActive = true;
      existingToken.lastUsedAt = new Date();
      if (dto.deviceType) existingToken.deviceType = dto.deviceType;
      if (dto.deviceInfo) existingToken.deviceInfo = dto.deviceInfo;
      
      return await this.fcmTokenRepo.save(existingToken);
    }

    // Create new token
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const fcmToken = this.fcmTokenRepo.create({
      token: dto.token,
      userId,
      deviceType: dto.deviceType,
      deviceInfo: dto.deviceInfo,
      isActive: true,
      lastUsedAt: new Date(),
    });

    return await this.fcmTokenRepo.save(fcmToken);
  }

  async unregisterFcmToken(userId: string, token: string): Promise<void> {
    this.logger.log(`Unregistering FCM token for user: ${userId}`);

    const result = await this.fcmTokenRepo.update(
      { userId, token },
      { isActive: false }
    );

    if (result.affected === 0) {
      throw new Error('Token not found or already inactive');
    }
  }

  async getUserNotifications(userId: string, limit = 50, offset = 0): Promise<Notification[]> {
    return await this.notificationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepo.update(
      { id: notificationId, userId },
      { readAt: new Date() }
    );

    if (result.affected === 0) {
      throw new Error('Notification not found or does not belong to user');
    }
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() }
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    return await this.notificationRepo.count({
      where: { userId, readAt: IsNull() },
    });
  }

  private async deactivateToken(token: string): Promise<void> {
    await this.fcmTokenRepo.update(
      { token },
      { isActive: false }
    );
    this.logger.log(`Deactivated invalid FCM token: ${token.substring(0, 10)}...`);
  }

  // Convenience methods for common notification types
  async sendBookingConfirmation(userId: string, bookingDetails: any): Promise<Notification> {
    return await this.sendNotification({
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Booking Confirmed!',
      body: `Your booking for ${bookingDetails.fieldName} has been confirmed.`,
      userId,
      data: {
        type: 'booking',
        bookingId: bookingDetails.id,
        fieldId: bookingDetails.fieldId,
      },
    });
  }

  async sendMembershipCreated(userId: string, membershipDetails: any): Promise<Notification> {
    return await this.sendNotification({
      type: NotificationType.MEMBERSHIP_CREATED,
      title: 'Membership Created!',
      body: `Your membership plan has been successfully created.`,
      userId,
      data: {
        type: 'membership',
        membershipId: membershipDetails.id,
        fieldId: membershipDetails.fieldId,
      },
    });
  }

  async sendPaymentSuccess(userId: string, paymentDetails: any): Promise<Notification> {
    return await this.sendNotification({
      type: NotificationType.PAYMENT_SUCCESS,
      title: 'Payment Successful!',
      body: `Your payment of ${paymentDetails.amount} has been processed successfully.`,
      userId,
      data: {
        type: 'payment',
        paymentId: paymentDetails.id,
        amount: paymentDetails.amount,
      },
    });
  }
}
