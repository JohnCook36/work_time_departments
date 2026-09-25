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
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  notificationPageResponse,
  notificationPreferencesResponse,
  notificationPreferenceResponse,
  notificationReadAllResponse,
  notificationReadResponse,
  notificationUnreadCountResponse,
} from '../openapi.responses';
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
  @ApiResponse({ status: 200, schema: notificationPageResponse })
  @Get('notifications')
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: NotificationListQuery,
  ) {
    return this.notifications.listOwn(user.id, query ?? {});
  }

  @ApiOperation({ summary: 'Get current user unread notification count' })
  @ApiResponse({ status: 200, schema: notificationUnreadCountResponse })
  @Get('notifications/unread-count')
  unreadCount(@CurrentUser() user: AuthUserContext) {
    return this.notifications.unreadCount(user.id);
  }

  @ApiOperation({ summary: 'Mark one current-user notification as read' })
  @ApiResponse({ status: 200, schema: notificationReadResponse })
  @Patch('notifications/:notificationId/read')
  markRead(
    @CurrentUser() user: AuthUserContext,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notifications.markRead(user.id, notificationId);
  }

  @ApiOperation({ summary: 'Mark all current-user notifications as read' })
  @ApiResponse({ status: 200, schema: notificationReadAllResponse })
  @Patch('notifications/read-all')
  markAllRead(@CurrentUser() user: AuthUserContext) {
    return this.notifications.markAllRead(user.id);
  }

  @ApiOperation({ summary: 'List current user notification preferences' })
  @ApiResponse({ status: 200, schema: notificationPreferencesResponse })
  @Get('notification-preferences')
  preferences(@CurrentUser() user: AuthUserContext) {
    return this.notifications.listPreferences(user.id);
  }

  @ApiOperation({ summary: 'Update one current-user notification preference' })
  @ApiResponse({ status: 200, schema: notificationPreferenceResponse })
  @Patch('notification-preferences/:category')
  updatePreference(
    @CurrentUser() user: AuthUserContext,
    @Param('category') category: string,
    @Body() body: NotificationPreferenceUpdateInput,
  ) {
    return this.notifications.updatePreference(user.id, category, body ?? {});
  }
}
