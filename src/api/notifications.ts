import { apiRequest } from './auth';

export type NotificationCategory =
  | 'SHIFT_CHANGE'
  | 'SCHEDULE_PUBLICATION'
  | 'TASK'
  | 'SCHEDULE_RULE'
  | 'SYSTEM';

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  entityType: string;
  entityId: string | null;
  eventKey: string;
  critical: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
}

export interface NotificationPreference {
  category: NotificationCategory;
  enabled: boolean;
  configurable: boolean;
}

export function getNotifications() {
  return apiRequest<NotificationPage>('/notifications');
}

export function getUnreadNotificationCount() {
  return apiRequest<{ count: number }>('/notifications/unread-count');
}

export function markNotificationRead(notificationId: string) {
  return apiRequest<{ status: 'ok'; notificationId: string }>(
    '/notifications/' + encodeURIComponent(notificationId) + '/read',
    { method: 'PATCH' },
  );
}

export function markAllNotificationsRead() {
  return apiRequest<{ status: 'ok'; updated: number }>(
    '/notifications/read-all',
    { method: 'PATCH' },
  );
}

export function getNotificationPreferences() {
  return apiRequest<NotificationPreference[]>('/notification-preferences');
}

export function updateNotificationPreference(
  category: NotificationCategory,
  enabled: boolean,
) {
  return apiRequest<NotificationPreference>(
    '/notification-preferences/' + encodeURIComponent(category),
    {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    },
  );
}
