import {
  NotificationCategory,
  NotificationEntityType,
} from '@prisma/client';

import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL notification foundation', () => {
  let prisma: PrismaService;
  let service: NotificationsService;

  async function clearDatabase() {
    await prisma.notificationPreference.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.authChallenge.deleteMany();
    await prisma.user.deleteMany();
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (
      !url.includes('work_time_departments_test') ||
      (!url.includes('localhost') && !url.includes('127.0.0.1'))
    ) {
      throw new Error(
        'Live tests require a dedicated local work_time_departments_test database',
      );
    }

    prisma = new PrismaService();
    await prisma.$connect();
    service = new NotificationsService(prisma);
  });

  beforeEach(async () => clearDatabase());

  afterAll(async () => {
    if (prisma) {
      await clearDatabase();
      await prisma.$disconnect();
    }
  });

  it('deduplicates producer events per recipient and isolates inbox reads', async () => {
    const userA = await prisma.user.create({
      data: { phoneE164: '+79996660001' },
    });
    const userB = await prisma.user.create({
      data: { phoneE164: '+79996660002' },
    });

    const first = await service.createForUser({
      recipientId: userA.id,
      category: NotificationCategory.SHIFT_CHANGE,
      entityType: NotificationEntityType.SHIFT_CHANGE_REQUEST,
      entityId: 'request-1',
      eventKey: 'shift-change:request-1:target-accepted',
    });
    const duplicate = await service.createForUser({
      recipientId: userA.id,
      category: NotificationCategory.SHIFT_CHANGE,
      entityType: NotificationEntityType.SHIFT_CHANGE_REQUEST,
      entityId: 'request-1',
      eventKey: 'shift-change:request-1:target-accepted',
    });
    const otherRecipient = await service.createForUser({
      recipientId: userB.id,
      category: NotificationCategory.SHIFT_CHANGE,
      entityType: NotificationEntityType.SHIFT_CHANGE_REQUEST,
      entityId: 'request-1',
      eventKey: 'shift-change:request-1:target-accepted',
    });

    expect(first?.id).toBe(duplicate?.id);
    expect(otherRecipient?.id).not.toBe(first?.id);
    expect(await prisma.notification.count()).toBe(2);

    const inboxA = await service.listOwn(userA.id, {});
    expect(inboxA.items.map(item => item.id)).toEqual([first?.id]);

    await expect(
      service.markRead(userB.id, first!.id),
    ).rejects.toMatchObject({ status: 404 });

    await service.markRead(userA.id, first!.id);
    expect(await service.unreadCount(userA.id)).toEqual({ count: 0 });
  });

  it('suppresses disabled non-critical events but never critical events', async () => {
    const user = await prisma.user.create({
      data: { phoneE164: '+79996660003' },
    });

    await service.updatePreference(user.id, 'SHIFT_CHANGE', {
      enabled: false,
    });

    const suppressed = await service.createForUser({
      recipientId: user.id,
      category: NotificationCategory.SHIFT_CHANGE,
      entityType: NotificationEntityType.SHIFT_CHANGE_REQUEST,
      entityId: 'request-2',
      eventKey: 'shift-change:request-2:info',
    });
    const critical = await service.createForUser({
      recipientId: user.id,
      category: NotificationCategory.SHIFT_CHANGE,
      entityType: NotificationEntityType.SHIFT_CHANGE_REQUEST,
      entityId: 'request-2',
      eventKey: 'shift-change:request-2:critical',
      critical: true,
    });

    expect(suppressed).toBeNull();
    expect(critical).not.toBeNull();
    expect(await prisma.notification.count()).toBe(1);
  });
});
