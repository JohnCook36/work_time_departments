import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { PermissionCapability, RoleType } from '@prisma/client';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { MembershipsService } from '../../src/memberships/memberships.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL role-management authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let memberships: MembershipsService;

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
    memberships = app.get(MembershipsService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects permission mutation after the manager membership is revoked', async () => {
    const department = await prisma.department.create({
      data: { name: 'Role security scope test' },
    });
    const manager = await prisma.user.create({
      data: { phoneE164: '+79990000882' },
    });
    const target = await prisma.user.create({
      data: { phoneE164: '+79990000883' },
    });
    const managerMembership = await prisma.membership.create({
      data: {
        userId: manager.id,
        departmentId: department.id,
        role: RoleType.DEPARTMENT_ADMIN,
      },
    });
    const targetMembership = await prisma.membership.create({
      data: {
        userId: target.id,
        departmentId: department.id,
        role: RoleType.DEPUTY,
        permissions: {
          create: {
            capability: PermissionCapability.SCHEDULE_READ,
          },
        },
      },
    });

    try {
      const staleManager = {
        id: manager.id,
        phoneE164: manager.phoneE164,
        employee: null,
        memberships: [
          {
            id: managerMembership.id,
            role: RoleType.DEPARTMENT_ADMIN,
            departmentId: department.id,
          },
        ],
      };

      await prisma.membership.update({
        where: { id: managerMembership.id },
        data: { isActive: false },
      });

      await expect(
        memberships.replacePermissions(staleManager, targetMembership.id, {
          permissions: [PermissionCapability.SCHEDULE_EDIT],
          expectedUpdatedAt: targetMembership.updatedAt.toISOString(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const storedPermissions = await prisma.membershipPermission.findMany({
        where: { membershipId: targetMembership.id },
        select: { capability: true },
      });
      expect(storedPermissions).toEqual([
        { capability: PermissionCapability.SCHEDULE_READ },
      ]);
    } finally {
      await prisma.membershipPermission.deleteMany({
        where: {
          membershipId: {
            in: [managerMembership.id, targetMembership.id],
          },
        },
      });
      await prisma.membership.deleteMany({
        where: {
          id: { in: [managerMembership.id, targetMembership.id] },
        },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [manager.id, target.id] } },
      });
      await prisma.department.delete({ where: { id: department.id } });
    }
  });
});
