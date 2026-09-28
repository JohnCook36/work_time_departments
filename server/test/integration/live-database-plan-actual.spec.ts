import { RoleType } from '@prisma/client';

import type { AuthUserContext } from '../../src/auth/auth.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import { AttendanceService } from '../../src/attendance/attendance.service';
import { PlanActualService } from '../../src/management/plan-actual.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL plan actual comparison', () => {
  let prisma: PrismaService;
  let planActual: PlanActualService;
  let attendance: AttendanceService;
  const previousZone = process.env.BUSINESS_TIME_ZONE;

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
    await prisma.scheduleAcknowledgement.deleteMany();
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        "SET LOCAL app.schedule_publication_retention_mode = 'on'",
      );
      await tx.schedulePublication.deleteMany();
    });
    await prisma.shift.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.membershipPermission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();
    await prisma.department.deleteMany();
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (
      !url.includes('work_time_departments_test') ||
      (!url.includes('localhost') && !url.includes('127.0.0.1'))
    ) {
      throw new Error(
        'Live plan/actual tests require a dedicated local work_time_departments_test database',
      );
    }
    process.env.BUSINESS_TIME_ZONE = 'Europe/Moscow';
    prisma = new PrismaService();
    await prisma.$connect();
    const authorization = new AuthorizationService();
    planActual = new PlanActualService(prisma, authorization);
    attendance = new AttendanceService(prisma, authorization);
  });

  beforeEach(async () => clearDatabase());

  afterAll(async () => {
    if (prisma) {
      await clearDatabase();
      await prisma.$disconnect();
    }
    if (previousZone === undefined) delete process.env.BUSINESS_TIME_ZONE;
    else process.env.BUSINESS_TIME_ZONE = previousZone;
  });

  it('keeps the immutable publication as plan and reflects attendance corrections', async () => {
    const department = await prisma.department.create({
      data: { name: 'Synthetic plan actual department' },
    });
    const managerUser = await prisma.user.create({
      data: { phoneE164: '+79998880101' },
    });
    const membership = await prisma.membership.create({
      data: {
        userId: managerUser.id,
        departmentId: department.id,
        role: RoleType.DEPARTMENT_ADMIN,
      },
    });
    const employee = await prisma.employee.create({
      data: {
        displayName: 'Synthetic employee',
        departmentId: department.id,
      },
    });
    const schedule = await prisma.schedule.create({
      data: { year: 2026, month: 9 },
    });
    const shift = await prisma.shift.create({
      data: {
        scheduleId: schedule.id,
        employeeId: employee.id,
        date: new Date('2026-09-27T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '17:00',
      },
    });

    await prisma.schedulePublication.create({
      data: {
        scheduleId: schedule.id,
        departmentId: department.id,
        version: 1,
        publishedByUserId: managerUser.id,
        sourceScheduleUpdatedAt: schedule.updatedAt,
        snapshot: {
          department: {
            id: department.id,
            name: department.name,
            kind: department.kind,
          },
          employees: [{
            id: employee.id,
            displayName: employee.displayName,
            employmentRate: 1,
            scheduleMode: 'FLEXIBLE',
            fixedStartTime: null,
            fixedEndTime: null,
          }],
          shifts: [{
            id: shift.id,
            employeeId: employee.id,
            date: '2026-09-27',
            code: null,
            startTime: '08:00',
            endTime: '17:00',
            isOff: false,
            updatedAt: shift.updatedAt.toISOString(),
          }],
        },
        diff: { employees: [], shifts: [] },
      },
    });

    // Draft changes after publication must not rewrite the historical plan.
    await prisma.shift.update({
      where: { id: shift.id },
      data: { startTime: '09:00', endTime: '18:00' },
    });

    const manager: AuthUserContext = {
      id: managerUser.id,
      phoneE164: managerUser.phoneE164,
      employee: null,
      memberships: [{
        id: membership.id,
        role: RoleType.DEPARTMENT_ADMIN,
        departmentId: department.id,
        permissions: [],
      }],
    };

    const created = await attendance.createCorrection(manager, {
      employeeId: employee.id,
      checkInAt: '2026-09-27T05:15:00.000Z',
      checkOutAt: '2026-09-27T13:30:00.000Z',
      reason: 'Synthetic attendance import',
    });

    const before = await planActual.read(manager, 2026, 9, department.id);
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0]).toMatchObject({
      shiftId: shift.id,
      startTime: '08:00',
      endTime: '17:00',
      workSessionIds: [created.id],
      latenessMinutes: 15,
      earlyLeaveMinutes: 30,
      actualMinutes: 495,
    });

    await attendance.correct(manager, created.id, {
      checkInAt: '2026-09-27T05:00:00.000Z',
      checkOutAt: '2026-09-27T14:00:00.000Z',
      expectedUpdatedAt: created.updatedAt,
      reason: 'Synthetic correction',
    });

    const after = await planActual.read(manager, 2026, 9, department.id);
    expect(after.rows[0]).toMatchObject({
      startTime: '08:00',
      endTime: '17:00',
      latenessMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      deltaMinutes: 0,
    });
  });
});
