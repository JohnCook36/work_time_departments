import { RoleType } from '@prisma/client';

import type { AuthUserContext } from '../../src/auth/auth.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScheduleAcknowledgementsService } from '../../src/schedules/schedule-acknowledgements.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL schedule acknowledgements', () => {
  let prisma: PrismaService;
  let service: ScheduleAcknowledgementsService;

  async function clearDatabase() {
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
        'Live tests require a dedicated local work_time_departments_test database',
      );
    }

    prisma = new PrismaService();
    await prisma.$connect();
    service = new ScheduleAcknowledgementsService(
      prisma,
      new AuthorizationService(),
    );
  });

  beforeEach(async () => clearDatabase());

  afterAll(async () => {
    if (prisma) {
      await clearDatabase();
      await prisma.$disconnect();
    }
  });

  it('persists one immutable acknowledgement per employee/publication version', async () => {
    const department = await prisma.department.create({
      data: { name: 'Acknowledgement test department' },
    });
    const [employeeUser, managerUser] = await Promise.all([
      prisma.user.create({ data: { phoneE164: '+79997770001' } }),
      prisma.user.create({ data: { phoneE164: '+79997770002' } }),
    ]);
    const employee = await prisma.employee.create({
      data: {
        displayName: 'Synthetic employee',
        departmentId: department.id,
        userId: employeeUser.id,
      },
    });
    const managerMembership = await prisma.membership.create({
      data: {
        userId: managerUser.id,
        departmentId: department.id,
        role: RoleType.DEPARTMENT_ADMIN,
      },
    });
    const schedule = await prisma.schedule.create({
      data: { year: 2026, month: 10 },
    });

    const snapshot = {
      department: {
        id: department.id,
        name: department.name,
        kind: department.kind,
      },
      employees: [
        {
          id: employee.id,
          displayName: employee.displayName,
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
        },
      ],
      shifts: [],
    };

    const publication1 = await prisma.schedulePublication.create({
      data: {
        scheduleId: schedule.id,
        departmentId: department.id,
        version: 1,
        publishedByUserId: managerUser.id,
        sourceScheduleUpdatedAt: schedule.updatedAt,
        snapshot,
        diff: { employees: [], shifts: [] },
      },
    });
    const publication2 = await prisma.schedulePublication.create({
      data: {
        scheduleId: schedule.id,
        departmentId: department.id,
        version: 2,
        publishedByUserId: managerUser.id,
        sourceScheduleUpdatedAt: schedule.updatedAt,
        snapshot,
        diff: { employees: [], shifts: [] },
      },
    });

    const employeeContext: AuthUserContext = {
      id: employeeUser.id,
      phoneE164: employeeUser.phoneE164,
      employee: {
        id: employee.id,
        displayName: employee.displayName,
        departmentId: department.id,
        departmentName: department.name,
        employmentRate: 1,
      },
      memberships: [
        {
          id: 'employee-context-membership',
          role: RoleType.EMPLOYEE,
          departmentId: department.id,
        },
      ],
    };
    const managerContext: AuthUserContext = {
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

    const first = await service.acknowledge(
      employeeContext,
      publication1.id,
    );
    const duplicate = await service.acknowledge(
      employeeContext,
      publication1.id,
    );

    expect(duplicate.id).toBe(first.id);
    expect(
      await prisma.scheduleAcknowledgement.count({
        where: { publicationId: publication1.id },
      }),
    ).toBe(1);

    await expect(
      service.getOwnStatus(employeeContext, publication2.id),
    ).resolves.toMatchObject({
      status: 'NOT_ACKNOWLEDGED',
      acknowledgedAt: null,
    });

    await expect(
      service.listPublicationStatuses(managerContext, publication1.id),
    ).resolves.toMatchObject({
      publicationId: publication1.id,
      employees: [
        expect.objectContaining({
          employeeId: employee.id,
          status: 'ACKNOWLEDGED',
        }),
      ],
    });
  });
});
