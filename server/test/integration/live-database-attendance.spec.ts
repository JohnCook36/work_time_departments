import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuditAction, PermissionCapability, RoleType, WorkSessionEventType } from '@prisma/client';

import type { AuthUserContext } from '../../src/auth/auth.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import { AttendanceService } from '../../src/attendance/attendance.service';
import { issueAttendanceToken } from '../../src/attendance/attendance-token';
import { PrismaService } from '../../src/prisma/prisma.service';

const describeLive = process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL attendance lifecycle and scope', () => {
  let prisma: PrismaService;
  let service: AttendanceService;
  let departmentId: string;
  let otherDepartmentId: string;
  let manager: AuthUserContext;
  let first: AuthUserContext;
  let second: AuthUserContext;
  let foreign: AuthUserContext;
  const secret = process.env.ATTENDANCE_QR_SECRET;

  async function clearDatabase() {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL wtd.attendance_retention_delete = 'on'");
      await tx.workSessionEvent.deleteMany();
    });
    await prisma.workSession.deleteMany();
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL wtd.audit_retention_delete = 'on'");
      await tx.auditLog.deleteMany();
    });
    await prisma.membershipPermission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();
    await prisma.department.deleteMany();
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!url.includes('work_time_departments_test') ||
        (!url.includes('localhost') && !url.includes('127.0.0.1'))) {
      throw new Error('Live attendance requires a dedicated local work_time_departments_test database');
    }
    process.env.ATTENDANCE_QR_SECRET = 'live-attendance-test-secret-at-least-32-characters';
    prisma = new PrismaService();
    await prisma.$connect();
    service = new AttendanceService(prisma, new AuthorizationService());
  });

  beforeEach(async () => {
    await clearDatabase();
    const department = await prisma.department.create({ data: { name: 'Synthetic attendance department' } });
    const other = await prisma.department.create({ data: { name: 'Separate synthetic department' } });
    departmentId = department.id;
    otherDepartmentId = other.id;
    const managerUser = await prisma.user.create({ data: { phoneE164: '+79990001001' } });
    const membership = await prisma.membership.create({
      data: { userId: managerUser.id, departmentId, role: RoleType.DEPARTMENT_ADMIN },
    });
    manager = {
      id: managerUser.id,
      phoneE164: managerUser.phoneE164,
      employee: null,
      memberships: [{ id: membership.id, departmentId, role: RoleType.DEPARTMENT_ADMIN, permissions: [] }],
    };
    async function linked(name: string, scope: string, suffix: string): Promise<AuthUserContext> {
      const user = await prisma.user.create({ data: { phoneE164: '+7999000' + suffix } });
      const employee = await prisma.employee.create({
        data: { displayName: name, userId: user.id, departmentId: scope },
      });
      return { id: user.id, phoneE164: user.phoneE164, employee: {
        id: employee.id, displayName: employee.displayName, departmentId: scope,
        departmentName: name, employmentRate: 1, scheduleMode: 'FLEXIBLE',
        fixedStartTime: null, fixedEndTime: null,
      }, memberships: [] } as AuthUserContext;
    }
    first = await linked('Synthetic first', departmentId, '1002');
    second = await linked('Synthetic second', departmentId, '1003');
    foreign = await linked('Synthetic foreign', otherDepartmentId, '1004');
  });

  afterAll(async () => {
    if (prisma) { await clearDatabase(); await prisma.$disconnect(); }
    if (secret === undefined) delete process.env.ATTENDANCE_QR_SECRET;
    else process.env.ATTENDANCE_QR_SECRET = secret;
  });

  it('shares one QR among employees, rejects per-user replay, uses server timestamps and preserves event history', async () => {
    const issued = await service.issueQr(manager, departmentId);
    const started = Date.now();
    const a = await service.checkIn(first, issued.token);
    const b = await service.checkIn(second, issued.token);
    expect(a.id).not.toBe(b.id);
    expect(new Date(a.checkInAt).getTime()).toBeGreaterThanOrEqual(started);
    expect(new Date(a.checkInAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(a.history.map(event => event.type)).toEqual([WorkSessionEventType.CHECK_IN]);
    await expect(service.checkIn(first, issued.token)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.checkIn(foreign, issued.token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.checkOut(first, issued.token)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.workSession.findUniqueOrThrow({ where: { id: a.id } })).checkOutAt).toBeNull();
    const next = await service.issueQr(manager, departmentId);
    const closed = await service.checkOut(first, next.token);
    expect(closed.checkOutAt).not.toBeNull();
    expect(closed.history.map(event => event.type)).toEqual([
      WorkSessionEventType.CHECK_IN, WorkSessionEventType.CHECK_OUT,
    ]);
    await expect(service.checkIn(first, issued.token)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.checkOut(first, next.token)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.workSession.count()).toBe(2);
    expect(await prisma.workSessionEvent.count()).toBe(3);
    const myRows = await service.mine(first, a.checkInAt.slice(0, 10), a.checkInAt.slice(0, 10));
    expect(myRows.map(row => row.id)).toEqual([a.id]);
    expect(JSON.stringify(myRows)).not.toMatch(/phoneE164|actorUserId|qrTokenHash/);
  });

  it('rejects an expired QR and leaves no ghost session or event', async () => {
    const issued = issueAttendanceToken(departmentId, new Date(Date.now() - 61_000));
    await expect(service.checkIn(first, issued.token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await prisma.workSession.count()).toBe(0);
    expect(await prisma.workSessionEvent.count()).toBe(0);
  });

  it('keeps manager reads scoped and rechecks current correction capability in the transaction', async () => {
    const issued = await service.issueQr(manager, departmentId);
    await service.checkIn(first, issued.token);
    const day = new Date().toISOString().slice(0, 10);
    const own = await service.department(manager, departmentId, day, day);
    expect(own).toHaveLength(1);
    await expect(service.department(manager, otherDepartmentId, day, day))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.department(first, departmentId, day, day))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createCorrection(manager, {
      employeeId: foreign.employee!.id,
      checkInAt: '2026-09-01T08:00:00.000Z', checkOutAt: '2026-09-01T17:00:00.000Z',
      reason: 'Synthetic cross-scope correction',
    })).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.membership.update({ where: { id: manager.memberships[0].id }, data: { isActive: false } });
    await expect(service.department(manager, departmentId, day, day))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.issueQr(manager, departmentId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createCorrection(manager, {
      employeeId: first.employee!.id,
      checkInAt: '2026-09-01T08:00:00.000Z', checkOutAt: '2026-09-01T17:00:00.000Z',
      reason: 'Synthetic correction',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma.workSession.count()).toBe(1);
  });

  it('keeps historical attendance in its original management scope after an employee transfers', async () => {
    const issued = await service.issueQr(manager, departmentId);
    const session = await service.checkIn(first, issued.token);
    await prisma.employee.update({
      where: { id: first.employee!.id }, data: { departmentId: otherDepartmentId },
    });
    const foreignManagerUser = await prisma.user.create({ data: { phoneE164: '+79990001005' } });
    const membership = await prisma.membership.create({
      data: { userId: foreignManagerUser.id, departmentId: otherDepartmentId, role: RoleType.DEPARTMENT_ADMIN },
    });
    const foreignManager: AuthUserContext = {
      id: foreignManagerUser.id, phoneE164: foreignManagerUser.phoneE164,
      employee: null, memberships: [{
        id: membership.id, role: RoleType.DEPARTMENT_ADMIN,
        departmentId: otherDepartmentId, permissions: [],
      }],
    };
    const day = session.checkInAt.slice(0, 10);
    expect((await service.department(manager, departmentId, day, day)).map(row => row.id))
      .toEqual([session.id]);
    expect(await service.department(foreignManager, otherDepartmentId, day, day)).toEqual([]);
    const updated = await service.correct(manager, session.id, {
      checkInAt: new Date(new Date(session.checkInAt).getTime() - 1000).toISOString(),
      checkOutAt: null, expectedUpdatedAt: session.updatedAt,
      reason: 'Synthetic transfer history adjustment',
    });
    expect(updated.departmentId).toBe(departmentId);
    expect(await prisma.auditLog.count({
      where: { action: AuditAction.WORK_SESSION_CORRECTED, departmentId },
    })).toBe(1);
  });

  it('audits manual correction, preserves prior event, locks stale updates and prevents mutation of event history', async () => {
    const input = {
      employeeId: first.employee!.id,
      checkInAt: '2026-09-01T08:00:00.000Z', checkOutAt: '2026-09-01T17:00:00.000Z',
      reason: 'Synthetic correction',
    };
    const created = await service.createCorrection(manager, input);
    expect(created.source).toBe('MANUAL');
    // A prior correction can produce a monotonic updatedAt slightly ahead of wall time.
    const futureVersion = new Date(Date.now() + 500);
    await prisma.workSession.update({ where: { id: created.id }, data: { updatedAt: futureVersion } });
    const updated = await service.correct(manager, created.id, {
      checkInAt: input.checkInAt, checkOutAt: '2026-09-01T16:00:00.000Z',
      expectedUpdatedAt: futureVersion.toISOString(), reason: 'Synthetic adjustment',
    });
    expect(updated.history).toHaveLength(2);
    expect(updated.history[1]).toMatchObject({
      type: WorkSessionEventType.CORRECTED,
      oldCheckOutAt: input.checkOutAt,
      checkOutAt: '2026-09-01T16:00:00.000Z',
    });
    expect(await prisma.auditLog.count({ where: { action: AuditAction.WORK_SESSION_CORRECTED } })).toBe(2);
    await expect(service.correct(manager, created.id, {
      checkInAt: input.checkInAt, checkOutAt: input.checkOutAt,
      expectedUpdatedAt: futureVersion.toISOString(), reason: 'Stale adjustment',
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.workSessionEvent.delete({ where: { id: updated.history[0].id } }))
      .rejects.toThrow();
    expect(await prisma.workSessionEvent.count()).toBe(2);
  });
});
