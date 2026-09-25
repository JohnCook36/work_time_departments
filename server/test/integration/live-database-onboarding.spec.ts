import { ConflictException } from '@nestjs/common';
import {
  AuditAction,
  OnboardingRequestStatus,
  RoleType,
} from '@prisma/client';

import type { AuthUserContext } from '../../src/auth/auth.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SchedulePublicationsService } from '../../src/schedules/schedule-publications.service';
import { SchedulesService } from '../../src/schedules/schedules.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL onboarding acceptance', () => {
  let prisma: PrismaService;
  let onboarding: OnboardingService;
  let publications: SchedulePublicationsService;
  let schedules: SchedulesService;

  async function clearDatabase() {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        "SET LOCAL app.schedule_rule_retention_mode = 'on'",
      );
      await tx.scheduleRuleVersion.deleteMany();
      await tx.scheduleRule.deleteMany();
    });
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        "SET LOCAL app.schedule_publication_retention_mode = 'on'",
      );
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
      await tx.$executeRawUnsafe(
        "SET LOCAL wtd.audit_retention_delete = 'on'",
      );
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
    onboarding = new OnboardingService(prisma, authorization);
    const publicationNotifications = new NotificationsService(prisma);
    publications = new SchedulePublicationsService(
      prisma,
      authorization,
      publicationNotifications,
    );
    schedules = new SchedulesService(prisma, authorization);
  });

  beforeEach(async () => clearDatabase());

  afterAll(async () => {
    if (prisma) {
      await clearDatabase();
      await prisma.$disconnect();
    }
  });

  async function baseFixture(phoneSuffix: string) {
    const department = await prisma.department.create({
      data: { name: 'Front Office onboarding acceptance', kind: 'FO' },
    });
    const requesterUser = await prisma.user.create({
      data: { phoneE164: '+79990000' + phoneSuffix },
    });
    const managerUser = await prisma.user.create({
      data: { phoneE164: '+79991111' + phoneSuffix },
    });
    const managerMembership = await prisma.membership.create({
      data: {
        userId: managerUser.id,
        departmentId: department.id,
        role: RoleType.DEPARTMENT_ADMIN,
      },
    });

    const requester: AuthUserContext = {
      id: requesterUser.id,
      phoneE164: requesterUser.phoneE164,
      employee: null,
      memberships: [],
    };
    const manager: AuthUserContext = {
      id: managerUser.id,
      phoneE164: managerUser.phoneE164,
      employee: null,
      memberships: [
        {
          id: managerMembership.id,
          role: RoleType.DEPARTMENT_ADMIN,
          departmentId: department.id,
        },
      ],
    };

    return {
      department,
      requesterUser,
      managerUser,
      requester,
      manager,
    };
  }

  it('CREATE_EMPLOYEE has one concurrent winner and creates exactly one Employee/Membership/audit row', async () => {
    const f = await baseFixture('0101');
    const request = await onboarding.requestNewEmployeeRegistration(
      f.requester,
      'Новый сотрудник E2E',
      f.department.id,
    );

    expect(request.status).toBe(OnboardingRequestStatus.PENDING);
    await expect(
      onboarding.requestNewEmployeeRegistration(
        f.requester,
        'Дубликат',
        f.department.id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const results = await Promise.allSettled([
      onboarding.approve(f.manager, request.id),
      onboarding.approve(f.manager, request.id),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(
      1,
    );

    const employees = await prisma.employee.findMany({
      where: { userId: f.requesterUser.id },
    });
    expect(employees).toHaveLength(1);
    expect(employees[0]).toMatchObject({
      displayName: 'Новый сотрудник E2E',
      departmentId: f.department.id,
      isActive: true,
    });

    expect(
      await prisma.membership.count({
        where: {
          userId: f.requesterUser.id,
          departmentId: f.department.id,
          role: RoleType.EMPLOYEE,
          isActive: true,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.auditLog.count({
        where: {
          action: AuditAction.ONBOARDING_APPROVED,
          entityId: request.id,
          departmentId: f.department.id,
        },
      }),
    ).toBe(1);

    expect(
      (
        await prisma.onboardingRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
    ).toBe(OnboardingRequestStatus.APPROVED);
  });

  it('LINK_EXISTING preserves Employee, Shift, Wish and publication identity after approval', async () => {
    const f = await baseFixture('0202');
    const employee = await prisma.employee.create({
      data: {
        displayName: 'Существующий сотрудник E2E',
        departmentId: f.department.id,
      },
    });
    const schedule = await prisma.schedule.create({
      data: { year: 2026, month: 9 },
    });
    const shift = await prisma.shift.create({
      data: {
        scheduleId: schedule.id,
        employeeId: employee.id,
        date: new Date('2026-09-28T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '17:00',
      },
    });
    const wish = await prisma.employeeWish.create({
      data: {
        employeeId: employee.id,
        year: 2026,
        month: 9,
        day: 29,
        text: 'По возможности выходной',
      },
    });

    const publication = await publications.publishDepartmentSchedule(
      f.manager,
      f.department.id,
      2026,
      9,
      'До привязки аккаунта',
    );
    const publicationBefore =
      await prisma.schedulePublication.findUniqueOrThrow({
        where: { id: publication.id },
      });

    const request = await onboarding.requestExistingEmployeeLink(
      f.requester,
      employee.id,
    );
    const approved = await onboarding.approve(f.manager, request.id);

    expect(approved.employee.id).toBe(employee.id);

    const linked = await prisma.employee.findUniqueOrThrow({
      where: { id: employee.id },
    });
    expect(linked.userId).toBe(f.requesterUser.id);

    expect(
      await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } }),
    ).toMatchObject({
      id: shift.id,
      employeeId: employee.id,
      scheduleId: schedule.id,
    });
    expect(
      await prisma.employeeWish.findUniqueOrThrow({ where: { id: wish.id } }),
    ).toMatchObject({
      id: wish.id,
      employeeId: employee.id,
    });

    const publicationAfter =
      await prisma.schedulePublication.findUniqueOrThrow({
        where: { id: publication.id },
      });
    expect(publicationAfter.snapshot).toEqual(publicationBefore.snapshot);
    expect(publicationAfter.diff).toEqual(publicationBefore.diff);

    const employeeMembership = await prisma.membership.findFirstOrThrow({
      where: {
        userId: f.requesterUser.id,
        departmentId: f.department.id,
        role: RoleType.EMPLOYEE,
        isActive: true,
      },
    });
    const linkedRequester: AuthUserContext = {
      id: f.requesterUser.id,
      phoneE164: f.requesterUser.phoneE164,
      employee: {
        id: employee.id,
        displayName: employee.displayName,
        departmentId: f.department.id,
        departmentName: f.department.name,
        employmentRate: employee.employmentRate,
      },
      memberships: [
        {
          id: employeeMembership.id,
          role: RoleType.EMPLOYEE,
          departmentId: f.department.id,
        },
      ],
    };

    const personal = await schedules.getMySchedule(linkedRequester, 2026, 9);
    expect(personal.shifts.map(item => item.id)).toContain(shift.id);

    const otherUser = await prisma.user.create({
      data: { phoneE164: '+799922220202' },
    });
    const otherContext: AuthUserContext = {
      id: otherUser.id,
      phoneE164: otherUser.phoneE164,
      employee: null,
      memberships: [],
    };
    await expect(
      onboarding.requestExistingEmployeeLink(otherContext, employee.id),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      await prisma.auditLog.count({
        where: {
          action: AuditAction.ONBOARDING_APPROVED,
          entityId: request.id,
          departmentId: f.department.id,
        },
      }),
    ).toBe(1);
  });
});
