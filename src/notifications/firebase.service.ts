import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private fcm: admin.messaging.Messaging | undefined;

  constructor() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      // Firebase will be initialized with credentials from environment variables
      // This will be configured when you provide the Firebase credentials
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        });
      }
      this.fcm = admin.messaging();
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK:', error);
      // Don't throw error here to allow app to start without Firebase
      // Firebase functionality will be disabled until properly configured
    }
  }

  async sendNotification(token: string, notification: {
    title: string;
    body: string;
    data?: Record<string, any>;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.fcm) {
        throw new Error('Firebase not initialized');
      }

      const message: admin.messaging.Message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        webpush: {
          notification: {
            icon: 'https://your-domain.com/icon.png',
            badge: 'https://your-domain.com/badge.png',
          },
        },
      };

      const response = await this.fcm.send(message);
      this.logger.log(`Notification sent successfully: ${response}`);
      
      return {
        success: true,
        messageId: response,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send notification: ${error.message}`);
      
      let errorMessage = error.message;
      
      // Handle specific FCM error codes
      if (error.code === 'messaging/registration-token-not-registered') {
        errorMessage = 'Device token is no longer valid';
      } else if (error.code === 'messaging/invalid-registration-token') {
        errorMessage = 'Invalid device token';
      } else if (error.code === 'messaging/unavailable') {
        errorMessage = 'Firebase service temporarily unavailable';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async sendMulticastNotification(tokens: string[], notification: {
    title: string;
    body: string;
    data?: Record<string, any>;
  }): Promise<{ success: boolean; results: any[]; failureCount: number; successCount: number }> {
    try {
      if (!this.fcm) {
        throw new Error('Firebase not initialized');
      }

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await this.fcm.sendMulticast(message);
      
      this.logger.log(`Multicast notification sent: ${response.successCount} success, ${response.failureCount} failures`);
      
      return {
        success: response.failureCount === 0,
        results: response.responses,
        failureCount: response.failureCount,
        successCount: response.successCount,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send multicast notification: ${error.message}`);
      
      return {
        success: false,
        results: [],
        failureCount: tokens.length,
        successCount: 0,
      };
    }
  }

  isInitialized(): boolean {
    return !!this.fcm && admin.apps.length > 0;
  }
}
