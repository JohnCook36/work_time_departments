import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  NotificationListQuery,
  NotificationPreferenceUpdateInput,
  NotificationsService,
} from './notifications.service';

@ApiTags('notifications')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiBadRequestResponse({ description: 'Invalid notification request.' })
@Controller()
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @ApiOperation({ summary: 'List current user notifications' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Get('notifications')
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: NotificationListQuery,
  ) {
    return this.notifications.listOwn(user.id, query ?? {});
  }

  @ApiOperation({ summary: 'Get current user unread notification count' })
  @Get('notifications/unread-count')
  unreadCount(@CurrentUser() user: AuthUserContext) {
    return this.notifications.unreadCount(user.id);
  }

  @ApiOperation({ summary: 'Mark one current-user notification as read' })
  @Patch('notifications/:notificationId/read')
  markRead(
    @CurrentUser() user: AuthUserContext,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notifications.markRead(user.id, notificationId);
  }

  @ApiOperation({ summary: 'Mark all current-user notifications as read' })
  @Patch('notifications/read-all')
  markAllRead(@CurrentUser() user: AuthUserContext) {
    return this.notifications.markAllRead(user.id);
  }

  @ApiOperation({ summary: 'List current user notification preferences' })
  @Get('notification-preferences')
  preferences(@CurrentUser() user: AuthUserContext) {
    return this.notifications.listPreferences(user.id);
  }

  @ApiOperation({ summary: 'Update one current-user notification preference' })
  @Patch('notification-preferences/:category')
  updatePreference(
    @CurrentUser() user: AuthUserContext,
    @Param('category') category: string,
    @Body() body: NotificationPreferenceUpdateInput,
  ) {
    return this.notifications.updatePreference(user.id, category, body ?? {});
  }
}
