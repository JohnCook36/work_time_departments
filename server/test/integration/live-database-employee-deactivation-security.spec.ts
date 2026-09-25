import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { RoleType } from '@prisma/client';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { EmployeesService } from '../../src/employees/employees.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL employee deactivation authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let employees: EmployeesService;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (
      !databaseUrl.includes('work_time_departments_test') ||
      (!databaseUrl.includes('localhost') &&
        !databaseUrl.includes('127.0.0.1'))
    ) {
      throw new Error(
        'Live database tests require a dedicated local work_time_departments_test database',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    employees = app.get(EmployeesService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects deactivation after the manager membership is revoked', async () => {
    const department = await prisma.department.create({
      data: { name: 'Employee security scope test' },
    });
    const manager = await prisma.user.create({
      data: { phoneE164: '+79990000881' },
    });
    const membership = await prisma.membership.create({
      data: {
        userId: manager.id,
        departmentId: department.id,
        role: RoleType.DEPARTMENT_ADMIN,
      },
    });
    const employee = await prisma.employee.create({
      data: {
        displayName: 'Protected employee',
        departmentId: department.id,
      },
    });

    try {
      const staleManager = {
        id: manager.id,
        phoneE164: manager.phoneE164,
        employee: null,
        memberships: [
          {
            id: membership.id,
            role: RoleType.DEPARTMENT_ADMIN,
            departmentId: department.id,
          },
        ],
      };

      await prisma.membership.update({
        where: { id: membership.id },
        data: { isActive: false },
      });

      await expect(
        employees.deactivateEmployee(staleManager, employee.id, {
          expectedUpdatedAt: employee.updatedAt.toISOString(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(
        await prisma.employee.findUniqueOrThrow({
          where: { id: employee.id },
        }),
      ).toMatchObject({ isActive: true });
    } finally {
      await prisma.employee.delete({ where: { id: employee.id } });
      await prisma.membership.delete({ where: { id: membership.id } });
      await prisma.user.delete({ where: { id: manager.id } });
      await prisma.department.delete({ where: { id: department.id } });
    }
  });
});
