import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { FieldSlot } from '../../fields/entities/field-slot.entity';
import { Field } from '../../fields/entities/field.entity';
import { UserAccount } from '../../auth/entities/user.entity';
import { GroundOwnerAccount } from '../../auth/entities/ground-owner.entity';
import { FirebaseService } from '../../notifications/firebase.service';

@Injectable()
export class BookingReminderCronService {
  private readonly logger = new Logger(BookingReminderCronService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotRepo: Repository<FieldSlot>,
    @InjectRepository(Field)
    private readonly fieldRepo: Repository<Field>,
    @InjectRepository(UserAccount)
    private readonly userRepo: Repository<UserAccount>,
    @InjectRepository(GroundOwnerAccount)
    private readonly groundOwnerRepo: Repository<GroundOwnerAccount>,
    private readonly firebaseService: FirebaseService,
  ) {}

  /**
   * Run every 30 minutes to check for bookings that need reminders
   */
  @Cron('*/30 * * * *')
  async sendBookingReminders(): Promise<void> {
    try {
      const now = new Date();
      const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
      
      // Format dates for comparison
      const currentDateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const targetTimeStr = thirtyMinutesFromNow.toTimeString().slice(0, 5); // HH:MM
      
      this.logger.log(`Checking for bookings at ${targetTimeStr} on ${currentDateStr}`);

      // Find bookings that are scheduled for 30 minutes from now
      const upcomingBookings = await this.bookingRepo
        .createQueryBuilder('booking')
        .leftJoinAndSelect('booking.user', 'user')
        .leftJoinAndSelect('booking.field', 'field')
        .leftJoinAndSelect('booking.slot', 'slot')
        .leftJoinAndSelect('field.owner', 'owner')
        .where('booking.status = :status', { status: 'booked' })
        .andWhere('slot.slot_date = :date', { date: currentDateStr })
        .andWhere('slot.start_time = :time', { time: targetTimeStr })
        .getMany();

      this.logger.log(`Found ${upcomingBookings.length} upcoming bookings for reminders`);

      for (const booking of upcomingBookings) {
        await this.sendReminderNotifications(booking);
      }
    } catch (error) {
      this.logger.error('Error in booking reminder cron:', error);
    }
  }

  /**
   * Send reminder notifications for a specific booking
   */
  private async sendReminderNotifications(booking: Booking): Promise<void> {
    try {
      this.logger.log(`Processing reminders for booking ${booking.id}`);

      // Send notification to user who made the booking
      await this.sendUserReminder(booking);

      // Send notification to ground owner
      await this.sendGroundOwnerReminder(booking);

    } catch (error) {
      this.logger.error(`Error sending reminders for booking ${booking.id}:`, error);
    }
  }

  /**
   * Send reminder notification to the user
   */
  private async sendUserReminder(booking: Booking): Promise<void> {
    try {
      if (!booking.user) {
        this.logger.warn(`No user found for booking ${booking.id}`);
        return;
      }

      const notificationTitle = 'Game Reminder!';
      const notificationBody = `Your game at ${booking.field?.venueName || 'the field'} is starting in 30 minutes! Get ready for your match.`;

      // Get user's FCM token and send actual notification
      const userToken = await this.getUserFcmToken(booking.user.id);
      if (userToken) {
        const result = await this.firebaseService.sendNotification(userToken, {
          title: notificationTitle,
          body: notificationBody,
          data: {
            type: 'booking_reminder',
            bookingId: booking.id,
            fieldId: booking.fieldId,
            startTime: booking.slot?.startTime,
          },
        });

        if (result.success) {
          this.logger.log(`Successfully sent user reminder for booking ${booking.id} to user ${booking.user.name || booking.user.email || booking.user.mobileNumber}`);
        } else {
          this.logger.error(`Failed to send user reminder for booking ${booking.id}: ${result.error}`);
        }
      } else {
        this.logger.log(`No FCM token found for user ${booking.user.name || booking.user.email || booking.user.mobileNumber}. Skipping notification.`);
      }

    } catch (error) {
      this.logger.error(`Error sending user reminder for booking ${booking.id}:`, error);
    }
  }

  /**
   * Send reminder notification to the ground owner
   */
  private async sendGroundOwnerReminder(booking: Booking): Promise<void> {
    try {
      if (!booking.field?.owner) {
        this.logger.warn(`No ground owner found for booking ${booking.id}`);
        return;
      }

      const notificationTitle = 'Booking Reminder!';
      const notificationBody = `You have a booking at ${booking.field.fieldName} in 30 minutes. Player: ${booking.user?.name || 'Guest'}`;

      // Get owner's FCM token and send actual notification
      const ownerToken = await this.getGroundOwnerFcmToken(booking.field.owner.id);
      if (ownerToken) {
        const result = await this.firebaseService.sendNotification(ownerToken, {
          title: notificationTitle,
          body: notificationBody,
          data: {
            type: 'booking_reminder',
            bookingId: booking.id,
            fieldId: booking.fieldId,
            userId: booking.userId,
            startTime: booking.slot?.startTime,
          },
        });

        if (result.success) {
          this.logger.log(`Successfully sent owner reminder for booking ${booking.id} to owner ${booking.field.owner.ownerName || booking.field.owner.email || booking.field.owner.mobileNumber}`);
        } else {
          this.logger.error(`Failed to send owner reminder for booking ${booking.id}: ${result.error}`);
        }
      } else {
        this.logger.log(`No FCM token found for owner ${booking.field.owner.ownerName || booking.field.owner.email || booking.field.owner.mobileNumber}. Skipping notification.`);
      }

    } catch (error) {
      this.logger.error(`Error sending ground owner reminder for booking ${booking.id}:`, error);
    }
  }

  /**
   * Helper method to get user's FCM token from database
   */
  private async getUserFcmToken(userId: string): Promise<string | null> {
    try {
      const user = await this.userRepo.findOne({
        where: { id: userId },
        select: ['id', 'fcmToken'],
      });
      return user?.fcmToken || null;
    } catch (error) {
      this.logger.error(`Error getting FCM token for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Helper method to get ground owner's FCM token from database
   */
  private async getGroundOwnerFcmToken(ownerId: string): Promise<string | null> {
    try {
      const owner = await this.groundOwnerRepo.findOne({
        where: { id: ownerId },
        select: ['id', 'fcmToken'],
      });
      return owner?.fcmToken || null;
    } catch (error) {
      this.logger.error(`Error getting FCM token for ground owner ${ownerId}:`, error);
      return null;
    }
  }
}
