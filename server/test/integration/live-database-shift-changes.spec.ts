import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AuditAction, NotificationCategory, NotificationEntityType, RoleType, ShiftChangeRequestEventType,
  ShiftChangeRequestKind, ShiftChangeRequestStatus,
} from '@prisma/client';

import { AuthorizationService } from '../../src/auth/authorization.service';
import { AuthUserContext } from '../../src/auth/auth.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SchedulePublicationsService } from '../../src/schedules/schedule-publications.service';
import { SchedulesService } from '../../src/schedules/schedules.service';
import { ShiftChangeRequestsService } from '../../src/shift-change-requests/shift-change-requests.service';

const describeLive = process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;
const september = new Date('2026-09-28T00:00:00.000Z');
const october = new Date('2026-10-04T00:00:00.000Z');

describeLive('live PostgreSQL shift-change application', () => {
  let prisma: PrismaService;
  let changes: ShiftChangeRequestsService;
  let schedules: SchedulesService;
  let publications: SchedulePublicationsService;

  async function clearDatabase() {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL app.schedule_rule_retention_mode = 'on'");
      await tx.scheduleRuleVersion.deleteMany();
      await tx.scheduleRule.deleteMany();
    });
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL app.schedule_publication_retention_mode = 'on'");
      await tx.schedulePublication.deleteMany();
    });
    await prisma.notificationPreference.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.shiftChangeRequestEvent.deleteMany();
    await prisma.shiftChangeRequest.deleteMany();
    await prisma.onboardingRequest.deleteMany();
    await prisma.employeeWish.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL wtd.audit_retention_delete = 'on'");
      await tx.auditLog.deleteMany();
    });
    await prisma.authSession.deleteMany();
    await prisma.authChallenge.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();
    await prisma.department.deleteMany();
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!url.includes('work_time_departments_test') ||
        (!url.includes('localhost') && !url.includes('127.0.0.1'))) {
      throw new Error('Live tests require a dedicated local work_time_departments_test database');
    }
    prisma = new PrismaService();
    await prisma.$connect();
    const authorization = new AuthorizationService();
    const notifications = new NotificationsService(prisma);
    changes = new ShiftChangeRequestsService(prisma, authorization, notifications);
    schedules = new SchedulesService(prisma, authorization);
    const publicationNotifications = new NotificationsService(prisma);
    publications = new SchedulePublicationsService(
      prisma,
      authorization,
      publicationNotifications,
    );
  });
  beforeEach(async () => clearDatabase());
  afterAll(async () => {
    if (prisma) { await clearDatabase(); await prisma.$disconnect(); }
  });

  async function fixture(kind: ShiftChangeRequestKind, targetDate?: Date) {
    const department = await prisma.department.create({ data: { name: 'Synthetic test department' } });
    const otherDepartment = await prisma.department.create({ data: { name: 'Other synthetic department' } });
    const [requesterUser, targetUser, managerUser] = await Promise.all([
      prisma.user.create({ data: { phoneE164: '+79990000101' } }),
      prisma.user.create({ data: { phoneE164: '+79990000102' } }),
      prisma.user.create({ data: { phoneE164: '+79990000103' } }),
    ]);
    const membership = await prisma.membership.create({ data: {
      userId: managerUser.id, departmentId: department.id, role: RoleType.DEPARTMENT_ADMIN,
    } });
    const [requesterEmployee, targetEmployee] = await Promise.all([
      prisma.employee.create({ data: { displayName: 'Synthetic requester', departmentId: department.id, userId: requesterUser.id } }),
      prisma.employee.create({ data: { displayName: 'Synthetic target', departmentId: department.id, userId: targetUser.id } }),
    ]);
    const firstSchedule = await prisma.schedule.create({ data: { year: 2026, month: 9 } });
    const secondSchedule = targetDate?.getUTCMonth() === 9
      ? await prisma.schedule.create({ data: { year: 2026, month: 10 } }) : firstSchedule;
    const source = await prisma.shift.create({ data: {
      scheduleId: firstSchedule.id, employeeId: requesterEmployee.id,
      date: september, startTime: '08:00', endTime: '17:00',
    } });
    const targetShift = kind === ShiftChangeRequestKind.SWAP
      ? await prisma.shift.create({ data: {
          scheduleId: secondSchedule.id, employeeId: targetEmployee.id,
          date: targetDate ?? september, code: 'N', startTime: '20:00', endTime: '08:00',
        } }) : null;
    const person = (userId: string, employeeId: string): AuthUserContext => ({
      id: userId, phoneE164: '+79990000100',
      employee: { id: employeeId, displayName: 'Synthetic', departmentId: department.id,
        departmentName: department.name, employmentRate: 1 },
      memberships: [],
    });
    const requester = person(requesterUser.id, requesterEmployee.id);
    const target = person(targetUser.id, targetEmployee.id);
    const manager: AuthUserContext = {
      id: managerUser.id, phoneE164: '+79990000103', employee: null,
      memberships: [{ id: membership.id, role: RoleType.DEPARTMENT_ADMIN, departmentId: department.id }],
    };
    const request = await changes.create(requester, {
      kind, targetEmployeeId: targetEmployee.id, requesterShiftId: source.id,
      ...(targetShift ? { targetShiftId: targetShift.id } : {}),
    });
    await changes.accept(target, request.id);
    return { department, otherDepartment, manager, requester, target, source, targetShift,
      requesterEmployee, targetEmployee, firstSchedule, secondSchedule, request };
  }

  async function expectManagerNotifications(
    requestId: string,
    requesterUserId: string,
    targetUserId: string,
    outcome: ShiftChangeRequestEventType,
  ) {
    const eventKey = `shift-change:${requestId}:${outcome}`;
    const opposite = outcome === ShiftChangeRequestEventType.MANAGER_APPROVED
      ? ShiftChangeRequestEventType.MANAGER_REJECTED
      : ShiftChangeRequestEventType.MANAGER_APPROVED;
    const notifications = await prisma.notification.findMany({
      where: { entityId: requestId, eventKey: { in: [eventKey, `shift-change:${requestId}:${opposite}`] } },
      select: { recipientId: true, eventKey: true, entityType: true, category: true },
    });
    expect(notifications).toHaveLength(2);
    expect(notifications).toEqual(expect.arrayContaining(
      [requesterUserId, targetUserId].map(recipientId => ({
        recipientId,
        eventKey,
        entityType: NotificationEntityType.SHIFT_CHANGE_REQUEST,
        category: NotificationCategory.SHIFT_CHANGE,
      })),
    ));
    expect(notifications.filter(notification => notification.eventKey.endsWith(`:${opposite}`))).toHaveLength(0);
    expect(await prisma.notification.count({ where: { recipientId: { notIn: [requesterUserId, targetUserId] }, eventKey } })).toBe(0);
  }

  it('discovers only published same-department shifts without private fields', async () => {
    const f = await fixture(ShiftChangeRequestKind.SWAP);
    await publications.publishDepartmentSchedule(f.manager, f.department.id, 2026, 9);
    const anotherUser = await prisma.user.create({ data: { phoneE164: '+79990000104' } });
    const other = await prisma.employee.create({ data: {
      displayName: 'Other department', departmentId: f.otherDepartment.id, userId: anotherUser.id,
    } });
    const inactive = await prisma.employee.create({ data: {
      displayName: 'Inactive', departmentId: f.department.id, isActive: false,
    } });
    expect(await changes.discoverTargets(f.requester)).toEqual([
      { id: f.targetEmployee.id, displayName: 'Synthetic target' },
    ]);
    const single = await changes.discoverTargetShift(f.requester, f.targetEmployee.id, '2026-09-28', f.source.id);
    expect(single).toEqual({ id: f.targetShift!.id, date: '2026-09-28', code: 'N', startTime: '20:00', endTime: '08:00' });
    expect(JSON.stringify(single)).not.toMatch(/phone|userId|employmentRate|memberships/);
    await expect(changes.discoverTargetShift(f.requester, other.id, '2026-09-28', f.source.id)).rejects.toMatchObject({ status: 404 });
    await expect(changes.discoverTargetShift(f.requester, inactive.id, '2026-09-28', f.source.id)).rejects.toMatchObject({ status: 404 });

    await prisma.shift.update({
      where: { id: f.targetShift!.id },
      data: { startTime: '10:00' },
    });
    await expect(
      changes.discoverTargetShift(
        f.requester,
        f.targetEmployee.id,
        '2026-09-28',
        f.source.id,
      ),
    ).rejects.toMatchObject({ status: 409 });

    await prisma.shift.update({ where: { id: f.targetShift!.id }, data: { isOff: true, startTime: null, endTime: null, code: null } });
    await expect(changes.discoverTargetShift(f.requester, f.targetEmployee.id, '2026-09-28', f.source.id)).rejects.toMatchObject({ status: 404 });
  });

  it('atomically swaps real Shift owners across months, records audit and preserves published history', async () => {
    const f = await fixture(ShiftChangeRequestKind.SWAP, october);
    const original = await publications.publishDepartmentSchedule(f.manager, f.department.id, 2026, 9);
    expect(original.version).toBe(1);
    const approved = await changes.approve(f.manager, f.request.id);
    expect(approved.status).toBe(ShiftChangeRequestStatus.MANAGER_APPROVED);
    await expectManagerNotifications(f.request.id, f.requester.id, f.target.id, ShiftChangeRequestEventType.MANAGER_APPROVED);
    const [source, target] = await Promise.all([
      prisma.shift.findUniqueOrThrow({ where: { id: f.source.id } }),
      prisma.shift.findUniqueOrThrow({ where: { id: f.targetShift!.id } }),
    ]);
    expect(source).toMatchObject({ employeeId: f.targetEmployee.id, startTime: '08:00' });
    expect(target).toMatchObject({ employeeId: f.requesterEmployee.id, code: 'N' });
    const events = await prisma.shiftChangeRequestEvent.findMany({ where: { requestId: f.request.id } });
    expect(events.filter(event => event.eventType === ShiftChangeRequestEventType.MANAGER_APPROVED)).toHaveLength(1);
    expect(events.at(-1)?.metadata).toMatchObject({ appliedShifts: [
      { shiftId: f.source.id, before: { employeeId: f.requesterEmployee.id }, after: { employeeId: f.targetEmployee.id } },
      { shiftId: f.targetShift!.id, before: { employeeId: f.targetEmployee.id }, after: { employeeId: f.requesterEmployee.id } },
    ] });
    const audit = await prisma.auditLog.findMany({ where: { actorUserId: f.manager.id } });
    expect(audit.map(item => item.action)).toEqual(expect.arrayContaining([
      AuditAction.SHIFT_CHANGE_MANAGER_APPROVED, AuditAction.SCHEDULE_CHANGED,
    ]));
    const oldPublication = await prisma.schedulePublication.findUniqueOrThrow({ where: { id: original.id } });
    expect(oldPublication.snapshot).toEqual(original.snapshot);
    const oldPersonal = await schedules.getMySchedule(f.requester, 2026, 9);
    expect(oldPersonal.shifts.map(shift => shift.id)).toContain(f.source.id);
    const next = await publications.publishDepartmentSchedule(f.manager, f.department.id, 2026, 9);
    expect(next.version).toBe(2);
    expect(next.diff).toMatchObject({ shifts: expect.arrayContaining([
      expect.objectContaining({ key: f.requesterEmployee.id + ':2026-09-28' }),
      expect.objectContaining({ key: f.targetEmployee.id + ':2026-09-28' }),
    ]) });
    const newPersonal = await schedules.getMySchedule(f.target, 2026, 9);
    expect(newPersonal.shifts.map(shift => shift.id)).toContain(f.source.id);
    expect((await prisma.schedulePublication.findUniqueOrThrow({ where: { id: original.id } })).snapshot).toEqual(original.snapshot);
    await expect(changes.approve(f.manager, f.request.id)).rejects.toBeInstanceOf(ConflictException);
    await expectManagerNotifications(f.request.id, f.requester.id, f.target.id, ShiftChangeRequestEventType.MANAGER_APPROVED);
  });

  it('rejects manager rejection when database membership was revoked after target accepted', async () => {
    const f = await fixture(ShiftChangeRequestKind.COVER);
    await prisma.membership.updateMany({
      where: { userId: f.manager.id },
      data: { isActive: false },
    });

    await expect(
      changes.managerReject(f.manager, f.request.id),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(
      (await prisma.shiftChangeRequest.findUniqueOrThrow({
        where: { id: f.request.id },
      })).status,
    ).toBe(ShiftChangeRequestStatus.PENDING_MANAGER);
    expect(
      await prisma.shiftChangeRequestEvent.count({
        where: {
          requestId: f.request.id,
          eventType: ShiftChangeRequestEventType.MANAGER_REJECTED,
        },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: f.request.id,
          action: AuditAction.SHIFT_CHANGE_MANAGER_REJECTED,
        },
      }),
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: {
          entityId: f.request.id,
          eventKey: `shift-change:${f.request.id}:MANAGER_REJECTED`,
        },
      }),
    ).toBe(0);
  });

  it('notifies only requester and target about manager rejection, once per outcome', async () => {
    const f = await fixture(ShiftChangeRequestKind.COVER);
    const rejected = await changes.managerReject(f.manager, f.request.id);
    expect(rejected.status).toBe(ShiftChangeRequestStatus.MANAGER_REJECTED);
    expect(await prisma.shiftChangeRequestEvent.count({ where: {
      requestId: f.request.id, eventType: ShiftChangeRequestEventType.MANAGER_REJECTED,
    } })).toBe(1);
    expect(await prisma.auditLog.count({ where: {
      entityId: f.request.id, action: AuditAction.SHIFT_CHANGE_MANAGER_REJECTED,
    } })).toBe(1);
    await expectManagerNotifications(f.request.id, f.requester.id, f.target.id, ShiftChangeRequestEventType.MANAGER_REJECTED);

    await expect(changes.managerReject(f.manager, f.request.id)).rejects.toBeInstanceOf(ConflictException);
    await expectManagerNotifications(f.request.id, f.requester.id, f.target.id, ShiftChangeRequestEventType.MANAGER_REJECTED);
  });

  it('does not notify either manager outcome when rejection marks a request stale', async () => {
    const f = await fixture(ShiftChangeRequestKind.COVER);
    await prisma.shift.update({ where: { id: f.source.id }, data: { startTime: '10:00', updatedAt: october } });
    await expect(changes.managerReject(f.manager, f.request.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.shiftChangeRequest.findUniqueOrThrow({ where: { id: f.request.id } })).status).toBe(ShiftChangeRequestStatus.STALE);
    expect(await prisma.notification.count({ where: {
      entityId: f.request.id,
      eventKey: { in: [
        `shift-change:${f.request.id}:MANAGER_APPROVED`,
        `shift-change:${f.request.id}:MANAGER_REJECTED`,
      ] },
    } })).toBe(0);
  });

  it('rolls back rejection, audit and both notifications if notification persistence fails', async () => {
    const f = await fixture(ShiftChangeRequestKind.COVER);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_manager_notification() RETURNS trigger AS $$
      BEGIN IF NEW."recipientId" = '${f.target.id}' AND NEW."eventKey" = 'shift-change:${f.request.id}:MANAGER_REJECTED'
        THEN RAISE EXCEPTION 'test manager notification rejected'; END IF;
      RETURN NEW; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_manager_notification BEFORE INSERT ON "Notification"
      FOR EACH ROW EXECUTE FUNCTION reject_manager_notification()`);
    try {
      await expect(changes.managerReject(f.manager, f.request.id)).rejects.toThrow('test manager notification rejected');
      expect((await prisma.shiftChangeRequest.findUniqueOrThrow({ where: { id: f.request.id } })).status).toBe(ShiftChangeRequestStatus.PENDING_MANAGER);
      expect(await prisma.shiftChangeRequestEvent.count({ where: {
        requestId: f.request.id, eventType: ShiftChangeRequestEventType.MANAGER_REJECTED,
      } })).toBe(0);
      expect(await prisma.auditLog.count({ where: {
        entityId: f.request.id, action: AuditAction.SHIFT_CHANGE_MANAGER_REJECTED,
      } })).toBe(0);
      expect(await prisma.notification.count({ where: {
        entityId: f.request.id, eventKey: `shift-change:${f.request.id}:MANAGER_REJECTED`,
      } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS reject_manager_notification ON "Notification"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS reject_manager_notification()');
    }
  });

  it('exchanges times on one date without violating the unique employee cell', async () => {
    const f = await fixture(ShiftChangeRequestKind.SWAP);
    await changes.approve(f.manager, f.request.id);
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: f.source.id } })).toMatchObject({
      employeeId: f.requesterEmployee.id, startTime: '20:00', endTime: '08:00', code: 'N',
    });
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: f.targetShift!.id } })).toMatchObject({
      employeeId: f.targetEmployee.id, startTime: '08:00', endTime: '17:00', code: null,
    });
  });

  it('moves COVER to target and leaves requester cell empty', async () => {
    const f = await fixture(ShiftChangeRequestKind.COVER);
    const old = await publications.publishDepartmentSchedule(f.manager, f.department.id, 2026, 9);
    await changes.approve(f.manager, f.request.id);
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: f.source.id } })).toMatchObject({
      employeeId: f.targetEmployee.id, date: september,
    });
    expect(await prisma.shift.count({ where: {
      employeeId: f.requesterEmployee.id, date: september, scheduleId: f.firstSchedule.id,
    } })).toBe(0);
    expect((await schedules.getMySchedule(f.requester, 2026, 9)).shifts.map(shift => shift.id)).toContain(f.source.id);
    expect((await prisma.schedulePublication.findUniqueOrThrow({ where: { id: old.id } })).snapshot).toEqual(old.snapshot);
    const next = await publications.publishDepartmentSchedule(f.manager, f.department.id, 2026, 9);
    expect(next.version).toBe(2);
    expect(next.diff).toMatchObject({ shifts: expect.arrayContaining([
      expect.objectContaining({ key: f.requesterEmployee.id + ':2026-09-28' }),
      expect.objectContaining({ key: f.targetEmployee.id + ':2026-09-28' }),
    ]) });
    expect((await schedules.getMySchedule(f.target, 2026, 9)).shifts.map(shift => shift.id)).toContain(f.source.id);
  });

  it('returns 409 on occupied destination or OFF and PostgreSQL enforces the same unique key', async () => {
    const f = await fixture(ShiftChangeRequestKind.COVER);
    const occupied = await prisma.shift.create({ data: {
      scheduleId: f.firstSchedule.id, employeeId: f.targetEmployee.id, date: september, isOff: true,
    } });
    await expect(changes.approve(f.manager, f.request.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.shiftChangeRequest.findUniqueOrThrow({ where: { id: f.request.id } })).status).toBe(ShiftChangeRequestStatus.PENDING_MANAGER);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: f.source.id } })).employeeId).toBe(f.requesterEmployee.id);
    await expect(prisma.shift.update({ where: { id: f.source.id }, data: { employeeId: f.targetEmployee.id } })).rejects.toMatchObject({ code: 'P2002' });
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: occupied.id } })).isOff).toBe(true);
  });

  it('rejects SWAP if either destination date already has a separate Shift', async () => {
    const f = await fixture(ShiftChangeRequestKind.SWAP, october);
    await prisma.shift.create({ data: {
      scheduleId: f.secondSchedule.id, employeeId: f.requesterEmployee.id,
      date: october, startTime: '07:00', endTime: '15:00',
    } });
    await expect(changes.approve(f.manager, f.request.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: f.source.id } })).employeeId).toBe(f.requesterEmployee.id);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: f.targetShift!.id } })).employeeId).toBe(f.targetEmployee.id);
    expect((await prisma.shiftChangeRequest.findUniqueOrThrow({ where: { id: f.request.id } })).status).toBe(ShiftChangeRequestStatus.PENDING_MANAGER);
  });

  it.each(['requester', 'target'] as const)('marks stale %s Shift and never writes approval audit', async side => {
    const f = await fixture(ShiftChangeRequestKind.SWAP);
    const id = side === 'requester' ? f.source.id : f.targetShift!.id;
    await prisma.shift.update({ where: { id }, data: { startTime: '10:00' } });
    await expect(changes.approve(f.manager, f.request.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.shiftChangeRequest.findUniqueOrThrow({ where: { id: f.request.id } })).status).toBe(ShiftChangeRequestStatus.STALE);
    expect(await prisma.auditLog.count({ where: { action: AuditAction.SHIFT_CHANGE_MANAGER_APPROVED } })).toBe(0);
  });

  it.each(['moved', 'inactive'] as const)('rejects %s Employee before touching Shift', async scenario => {
    const f = await fixture(ShiftChangeRequestKind.COVER);
    await prisma.employee.update({ where: { id: f.targetEmployee.id }, data: scenario === 'moved'
      ? { departmentId: f.otherDepartment.id } : { isActive: false } });
    await expect(changes.approve(f.manager, f.request.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: f.source.id } })).employeeId).toBe(f.requesterEmployee.id);
  });

  it('rejects approval when database membership was revoked after target accepted', async () => {
    const f = await fixture(ShiftChangeRequestKind.COVER);
    await prisma.membership.updateMany({ where: { userId: f.manager.id }, data: { isActive: false } });
    await expect(changes.approve(f.manager, f.request.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: f.source.id } })).employeeId).toBe(f.requesterEmployee.id);
  });

  it('rejects a concurrently transitioned request and never changes its Shift', async () => {
    const f = await fixture(ShiftChangeRequestKind.COVER);
    await prisma.shiftChangeRequest.update({ where: { id: f.request.id }, data: { status: ShiftChangeRequestStatus.CANCELED } });
    await expect(changes.approve(f.manager, f.request.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: f.source.id } })).employeeId).toBe(f.requesterEmployee.id);
  });

  it('allows only one of two simultaneous approvals to commit', async () => {
    const f = await fixture(ShiftChangeRequestKind.COVER);
    const results = await Promise.allSettled([
      changes.approve(f.manager, f.request.id),
      changes.approve(f.manager, f.request.id),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: f.source.id } })).employeeId).toBe(f.targetEmployee.id);
    expect(await prisma.shiftChangeRequestEvent.count({ where: {
      requestId: f.request.id, eventType: ShiftChangeRequestEventType.MANAGER_APPROVED,
    } })).toBe(1);
  });

  it('rolls back the first SWAP update if PostgreSQL rejects the second Shift update', async () => {
    const f = await fixture(ShiftChangeRequestKind.SWAP, october);
    // A temporary test-only trigger makes the second update fail inside the real transaction.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_target_shift_update() RETURNS trigger AS $$
      BEGIN IF NEW.id = '${f.targetShift!.id}' THEN RAISE EXCEPTION 'test second update rejected'; END IF;
      RETURN NEW; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_target_shift_update BEFORE UPDATE ON "Shift"
      FOR EACH ROW EXECUTE FUNCTION reject_target_shift_update()`);
    try {
      await expect(changes.approve(f.manager, f.request.id)).rejects.toThrow('test second update rejected');
      expect((await prisma.shift.findUniqueOrThrow({ where: { id: f.source.id } })).employeeId).toBe(f.requesterEmployee.id);
      expect((await prisma.shift.findUniqueOrThrow({ where: { id: f.targetShift!.id } })).employeeId).toBe(f.targetEmployee.id);
      expect((await prisma.shiftChangeRequest.findUniqueOrThrow({ where: { id: f.request.id } })).status).toBe(ShiftChangeRequestStatus.PENDING_MANAGER);
      expect(await prisma.shiftChangeRequestEvent.count({ where: { requestId: f.request.id, eventType: ShiftChangeRequestEventType.MANAGER_APPROVED } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: AuditAction.SHIFT_CHANGE_MANAGER_APPROVED } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS reject_target_shift_update ON "Shift"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS reject_target_shift_update()');
    }
  });
});
