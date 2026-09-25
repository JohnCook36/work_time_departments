import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationCategory,
  NotificationEntityType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface NotificationListQuery {
  cursor?: unknown;
  limit?: unknown;
}

export interface NotificationPreferenceUpdateInput {
  enabled?: unknown;
}

type NotificationWriteClient = Pick<
  Prisma.TransactionClient,
  'notification' | 'notificationPreference'
>;

export interface CreateNotificationInput {
  recipientId: string;
  category: NotificationCategory;
  entityType: NotificationEntityType;
  entityId?: string | null;
  eventKey: string;
  critical?: boolean;
}

const NOTIFICATION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

const notificationSelect = {
  id: true,
  category: true,
  entityType: true,
  entityId: true,
  eventKey: true,
  critical: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return 30;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new BadRequestException('limit must be an integer between 1 and 100');
  }
  return parsed;
}

function parseCategory(value: string): NotificationCategory {
  if (!Object.values(NotificationCategory).includes(value as NotificationCategory)) {
    throw new BadRequestException('notification category is invalid');
  }
  return value as NotificationCategory;
}

function parseEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new BadRequestException('enabled must be boolean');
  }
  return value;
}

function serializeNotification(
  item: Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>,
) {
  return {
    ...item,
    readAt: item.readAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listOwn(userId: string, query: NotificationListQuery) {
    await this.cleanupExpired();
    const limit = parseLimit(query.limit);
    const cursor =
      typeof query.cursor === 'string' && query.cursor.trim()
        ? query.cursor.trim()
        : undefined;

    if (query.cursor !== undefined && !cursor) {
      throw new BadRequestException('cursor is invalid');
    }

    if (cursor) {
      const ownedCursor = await this.prisma.notification.findFirst({
        where: { id: cursor, recipientId: userId },
        select: { id: true },
      });
      if (!ownedCursor) throw new BadRequestException('cursor is invalid');
    }

    const items = await this.prisma.notification.findMany({
      where: { recipientId: userId },
      select: notificationSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      items: page.map(serializeNotification),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async unreadCount(userId: string) {
    await this.cleanupExpired();
    const count = await this.prisma.notification.count({
      where: { recipientId: userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, recipientId: userId },
      select: { id: true, readAt: true },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    if (!notification.readAt) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { readAt: new Date() },
      });
    }

    return { status: 'ok' as const, notificationId: notification.id };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { status: 'ok' as const, updated: result.count };
  }

  async listPreferences(userId: string) {
    const saved = await this.prisma.notificationPreference.findMany({
      where: { userId },
      select: { category: true, enabled: true },
    });
    const savedByCategory = new Map(
      saved.map(item => [item.category, item.enabled]),
    );

    return Object.values(NotificationCategory).map(category => ({
      category,
      enabled: savedByCategory.get(category) ?? true,
      configurable: category !== NotificationCategory.SYSTEM,
    }));
  }

  async updatePreference(
    userId: string,
    categoryValue: string,
    input: NotificationPreferenceUpdateInput,
  ) {
    const category = parseCategory(categoryValue);
    const enabled = parseEnabled(input.enabled);

    if (category === NotificationCategory.SYSTEM && !enabled) {
      throw new BadRequestException(
        'Critical system notifications cannot be disabled',
      );
    }

    const preference = await this.prisma.notificationPreference.upsert({
      where: { userId_category: { userId, category } },
      create: { userId, category, enabled },
      update: { enabled },
      select: { category: true, enabled: true },
    });

    return {
      ...preference,
      configurable: category !== NotificationCategory.SYSTEM,
    };
  }

  async createForUser(input: CreateNotificationInput) {
    return this.createWithClient(
      this.prisma as unknown as NotificationWriteClient,
      input,
    );
  }

  async createForUserInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateNotificationInput,
  ) {
    return this.createWithClient(tx, input);
  }

  private async cleanupExpired(): Promise<void> {
    await this.prisma.notification.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - NOTIFICATION_RETENTION_MS),
        },
      },
    });
  }

  private async createWithClient(
    client: NotificationWriteClient,
    input: CreateNotificationInput,
  ) {
    const eventKey = input.eventKey.trim();
    if (!eventKey) throw new BadRequestException('eventKey is required');

    const critical = input.critical ?? false;

    if (!critical) {
      const preference = await client.notificationPreference.findUnique({
        where: {
          userId_category: {
            userId: input.recipientId,
            category: input.category,
          },
        },
        select: { enabled: true },
      });

      if (preference?.enabled === false) return null;
    }

    const notification = await client.notification.upsert({
      where: {
        recipientId_eventKey: {
          recipientId: input.recipientId,
          eventKey,
        },
      },
      update: {},
      create: {
        recipientId: input.recipientId,
        category: input.category,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        eventKey,
        critical,
      },
      select: notificationSelect,
    });

    return serializeNotification(notification);
  }
}
