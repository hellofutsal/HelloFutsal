import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentAccount } from '../auth/decorators/current-account.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedAccount } from '../auth/types/authenticated-account.type';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  async sendNotification(@Body() dto: SendNotificationDto) {
    const notification = await this.notificationsService.sendNotification(dto);
    return {
      success: true,
      notification: {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        status: notification.status,
        createdAt: notification.createdAt,
      },
    };
  }

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  async broadcastNotification(
    @Body() body: {
      title: string;
      body: string;
      type: string;
      data?: Record<string, any>;
    },
  ) {
    const result = await this.notificationsService.sendNotificationToAllUsers(
      body.title,
      body.body,
      body.type as any,
      body.data,
    );
    
    return {
      success: true,
      ...result,
    };
  }

  @Post('register-token')
  async registerFcmToken(
    @Body() dto: RegisterFcmTokenDto,
    @CurrentAccount() currentUser: AuthenticatedAccount,
  ) {
    const token = await this.notificationsService.registerFcmToken(
      currentUser.id,
      dto,
    );
    
    return {
      success: true,
      token: {
        id: token.id,
        deviceType: token.deviceType,
        isActive: token.isActive,
        createdAt: token.createdAt,
      },
    };
  }

  @Delete('unregister-token/:token')
  @HttpCode(HttpStatus.OK)
  async unregisterFcmToken(
    @Param('token') token: string,
    @CurrentAccount() currentUser: AuthenticatedAccount,
  ) {
    await this.notificationsService.unregisterFcmToken(currentUser.id, token);
    
    return {
      success: true,
      message: 'Token unregistered successfully',
    };
  }

  @Get()
  async getUserNotifications(
    @CurrentAccount() currentUser: AuthenticatedAccount,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const notifications = await this.notificationsService.getUserNotifications(
      currentUser.id,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
    
    return {
      success: true,
      notifications: notifications.map(notification => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        status: notification.status,
        data: notification.data,
        createdAt: notification.createdAt,
        readAt: notification.readAt,
      })),
    };
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentAccount() currentUser: AuthenticatedAccount) {
    const count = await this.notificationsService.getUnreadCount(currentUser.id);
    
    return {
      success: true,
      unreadCount: count,
    };
  }

  @Put(':id/read')
  @HttpCode(HttpStatus.OK)
  async markNotificationAsRead(
    @Param('id') id: string,
    @CurrentAccount() currentUser: AuthenticatedAccount,
  ) {
    await this.notificationsService.markNotificationAsRead(id, currentUser.id);
    
    return {
      success: true,
      message: 'Notification marked as read',
    };
  }

  @Put('mark-all-read')
  @HttpCode(HttpStatus.OK)
  async markAllNotificationsAsRead(
    @CurrentAccount() currentUser: AuthenticatedAccount,
  ) {
    await this.notificationsService.markAllNotificationsAsRead(currentUser.id);
    
    return {
      success: true,
      message: 'All notifications marked as read',
    };
  }
}
