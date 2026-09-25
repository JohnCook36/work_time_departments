import { RoleType } from '@prisma/client';

import type { AuthUserContext } from '../../src/auth/auth.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AbsencesService } from '../../src/absences/absences.service';
import { SchedulePublicationsService } from '../../src/schedules/schedule-publications.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL structured absences', () => {
  let prisma: PrismaService;
  let absences: AbsencesService;
  let publications: SchedulePublicationsService;
  let adminContext: AuthUserContext;

  async function clearDatabase() {
    await prisma.scheduleAcknowledgement.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.absence.deleteMany();
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        "SET LOCAL app.schedule_publication_retention_mode = 'on'",
      );
      await tx.schedulePublication.deleteMany();
    });
    await prisma.shift.deleteMany();
    await prisma.scheduleRuleVersion.deleteMany();
    await prisma.scheduleRule.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        "SET LOCAL app.audit_log_retention_mode = 'on'",
      );
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
    const authorization = new AuthorizationService();
    absences = new AbsencesService(prisma, authorization);
    publications = new SchedulePublicationsService(
      prisma,
      authorization,
      new NotificationsService(prisma),
    );
  });

  beforeEach(async () => {
    await clearDatabase();

    const department = await prisma.department.create({
      data: { name: 'Absence test department' },
    });
    const admin = await prisma.user.create({
      data: { phoneE164: '+79998880001' },
    });
    const membership = await prisma.membership.create({
      data: {
        userId: admin.id,
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
    await prisma.shift.create({
      data: {
        scheduleId: schedule.id,
        employeeId: employee.id,
        date: new Date('2026-09-20T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '17:00',
      },
    });

    adminContext = {
      id: admin.id,
      phoneE164: admin.phoneE164,
      employee: null,
      memberships: [
        {
          id: membership.id,
          role: RoleType.DEPARTMENT_ADMIN,
          departmentId: department.id,
        },
      ],
    };

    (adminContext as AuthUserContext & { testDepartmentId: string }).testDepartmentId =
      department.id;
    (adminContext as AuthUserContext & { testEmployeeId: string }).testEmployeeId =
      employee.id;
  });

  afterAll(async () => {
    if (prisma) {
      await clearDatabase();
      await prisma.$disconnect();
    }
  });

  it('blocks publication readiness while active and stops blocking after cancel', async () => {
    const departmentId = (
      adminContext as AuthUserContext & { testDepartmentId: string }
    ).testDepartmentId;
    const employeeId = (
      adminContext as AuthUserContext & { testEmployeeId: string }
    ).testEmployeeId;

    const created = await absences.create(adminContext, {
      employeeId,
      type: 'VACATION',
      startDate: '2026-09-19',
      endDate: '2026-09-21',
      comment: 'Planned leave',
    });

    const blocked = await publications.validateDepartmentSchedule(
      adminContext,
      departmentId,
      2026,
      9,
    );

    expect(blocked.canPublish).toBe(false);
    expect(blocked.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SHIFT_OVERLAPS_ABSENCE',
          employeeId,
          date: '2026-09-20',
        }),
      ]),
    );

    await absences.cancel(
      adminContext,
      created.id,
      created.updatedAt,
    );

    const allowed = await publications.validateDepartmentSchedule(
      adminContext,
      departmentId,
      2026,
      9,
    );

    expect(
      allowed.violations.some(
        violation => violation.code === 'SHIFT_OVERLAPS_ABSENCE',
      ),
    ).toBe(false);
  });
});
