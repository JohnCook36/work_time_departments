import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationCategory,
  NotificationEntityType,
} from '@prisma/client';

import { NotificationsService } from '../../../src/notifications/notifications.service';

function createPrismaMock() {
  return {
    notification: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    notificationPreference: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;
}

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new NotificationsService(prisma);
  });

  it('lists only the current user page and serializes timestamps', async () => {
    prisma.notification.findMany.mockResolvedValue([
      {
        id: 'notification-2',
        category: NotificationCategory.SHIFT_CHANGE,
        entityType: NotificationEntityType.SHIFT_CHANGE_REQUEST,
        entityId: 'request-2',
        eventKey: 'shift-change:request-2:accepted',
        critical: false,
        readAt: null,
        createdAt: new Date('2026-09-25T12:00:00.000Z'),
      },
      {
        id: 'notification-1',
        category: NotificationCategory.SCHEDULE_PUBLICATION,
        entityType: NotificationEntityType.SCHEDULE_PUBLICATION,
        entityId: 'publication-1',
        eventKey: 'publication:publication-1',
        critical: true,
        readAt: new Date('2026-09-25T11:30:00.000Z'),
        createdAt: new Date('2026-09-25T11:00:00.000Z'),
      },
    ]);

    const result = await service.listOwn('user-a', { limit: '30' });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: 'user-a' },
        take: 31,
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'notification-2',
        createdAt: '2026-09-25T12:00:00.000Z',
        readAt: null,
      }),
    );
  });

  it('rejects a cursor owned by another user', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);

    await expect(
      service.listOwn('user-a', { cursor: 'notification-other' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('does not let a user mark another user notification as read', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);

    await expect(
      service.markRead('user-a', 'notification-b'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('suppresses a non-critical producer event when the category is disabled', async () => {
    prisma.notificationPreference.findUnique.mockResolvedValue({
      enabled: false,
    });

    const result = await service.createForUser({
      recipientId: 'user-a',
      category: NotificationCategory.SHIFT_CHANGE,
      entityType: NotificationEntityType.SHIFT_CHANGE_REQUEST,
      entityId: 'request-1',
      eventKey: 'shift-change:request-1:accepted',
    });

    expect(result).toBeNull();
    expect(prisma.notification.upsert).not.toHaveBeenCalled();
  });

  it('critical producer events bypass preferences and use recipient-scoped idempotency', async () => {
    prisma.notification.upsert.mockResolvedValue({
      id: 'notification-1',
      category: NotificationCategory.SYSTEM,
      entityType: NotificationEntityType.SYSTEM,
      entityId: null,
      eventKey: 'system:security:1',
      critical: true,
      readAt: null,
      createdAt: new Date('2026-09-25T12:00:00.000Z'),
    });

    const result = await service.createForUser({
      recipientId: 'user-a',
      category: NotificationCategory.SYSTEM,
      entityType: NotificationEntityType.SYSTEM,
      eventKey: 'system:security:1',
      critical: true,
    });

    expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipientId_eventKey: {
            recipientId: 'user-a',
            eventKey: 'system:security:1',
          },
        },
      }),
    );
    expect(result?.critical).toBe(true);
  });

  it('does not allow disabling system notifications', async () => {
    await expect(
      service.updatePreference('user-a', 'SYSTEM', { enabled: false }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it('returns defaults for missing preferences and marks SYSTEM non-configurable', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([
      {
        category: NotificationCategory.TASK,
        enabled: false,
      },
    ]);

    const preferences = await service.listPreferences('user-a');

    expect(preferences).toContainEqual({
      category: NotificationCategory.TASK,
      enabled: false,
      configurable: true,
    });
    expect(preferences).toContainEqual({
      category: NotificationCategory.SYSTEM,
      enabled: true,
      configurable: false,
    });
  });
});
