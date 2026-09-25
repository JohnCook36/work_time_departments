import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { AbsenceType, RoleType } from '@prisma/client';
import { Test } from '@nestjs/testing';

import { AbsencesService } from '../../src/absences/absences.service';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL absence authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let absences: AbsencesService;

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
    absences = app.get(AbsencesService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects absence mutation after manager scope is revoked', async () => {
    const department = await prisma.department.create({
      data: { name: 'Absence security scope test' },
    });
    const manager = await prisma.user.create({
      data: { phoneE164: '+79990000885' },
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
        displayName: 'Absence target',
        departmentId: department.id,
      },
    });
    const absence = await prisma.absence.create({
      data: {
        employeeId: employee.id,
        type: AbsenceType.VACATION,
        startDate: new Date('2026-09-10T00:00:00.000Z'),
        endDate: new Date('2026-09-12T00:00:00.000Z'),
        createdByUserId: manager.id,
        updatedByUserId: manager.id,
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
        absences.update(staleManager, absence.id, {
          endDate: '2026-09-13',
          expectedUpdatedAt: absence.updatedAt.toISOString(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(
        await prisma.absence.findUniqueOrThrow({
          where: { id: absence.id },
        }),
      ).toMatchObject({
        endDate: absence.endDate,
      });
    } finally {
      await prisma.absence.delete({ where: { id: absence.id } });
      await prisma.employee.delete({ where: { id: employee.id } });
      await prisma.membership.delete({ where: { id: membership.id } });
      await prisma.user.delete({ where: { id: manager.id } });
      await prisma.department.delete({ where: { id: department.id } });
    }
  });
});
