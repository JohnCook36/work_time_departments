import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { RoleType } from '@prisma/client';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WishesService } from '../../src/wishes/wishes.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL wish authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let wishes: WishesService;

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
    wishes = app.get(WishesService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects wish creation after manager scope is revoked', async () => {
    const department = await prisma.department.create({
      data: { name: 'Wish security scope test' },
    });
    const manager = await prisma.user.create({
      data: { phoneE164: '+79990000886' },
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
        displayName: 'Wish target',
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
        wishes.createWish(staleManager, {
          employeeId: employee.id,
          year: 2026,
          month: 9,
          day: 22,
          text: 'Желательно выходной',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(
        await prisma.employeeWish.count({
          where: { employeeId: employee.id },
        }),
      ).toBe(0);
    } finally {
      await prisma.employeeWish.deleteMany({
        where: { employeeId: employee.id },
      });
      await prisma.employee.delete({ where: { id: employee.id } });
      await prisma.membership.delete({ where: { id: membership.id } });
      await prisma.user.delete({ where: { id: manager.id } });
      await prisma.department.delete({ where: { id: department.id } });
    }
  });
});
