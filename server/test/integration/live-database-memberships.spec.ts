import {
  AuditAction,
  AuditEntityType,
  PermissionCapability,
  RoleType,
} from '@prisma/client';

import type { AuthUserContext } from '../../src/auth/auth.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import { MembershipsService } from '../../src/memberships/memberships.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL role assignment lifecycle', () => {
  let prisma: PrismaService;
  let service: MembershipsService;

  async function clearDatabase() {
    await prisma.membershipPermission.deleteMany();
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
    service = new MembershipsService(prisma, new AuthorizationService());
  });

  beforeEach(async () => clearDatabase());

  afterAll(async () => {
    if (prisma) {
      await clearDatabase();
      await prisma.$disconnect();
    }
  });

  async function fixture() {
    const department = await prisma.department.create({
      data: { name: 'FO role acceptance', kind: 'FO' },
    });
    const otherDepartment = await prisma.department.create({
      data: { name: 'Other role acceptance', kind: 'GENERAL' },
    });

    const adminUser = await prisma.user.create({
      data: { phoneE164: '+79995550001' },
    });
    const adminEmployee = await prisma.employee.create({
      data: {
        displayName: 'Department admin',
        departmentId: department.id,
        userId: adminUser.id,
      },
    });
    const adminMembership = await prisma.membership.create({
      data: {
        userId: adminUser.id,
        departmentId: department.id,
        role: RoleType.DEPARTMENT_ADMIN,
      },
    });

    const targetUser = await prisma.user.create({
      data: { phoneE164: '+79995550002' },
    });
    const targetEmployee = await prisma.employee.create({
      data: {
        displayName: 'Target deputy',
        departmentId: department.id,
        userId: targetUser.id,
      },
    });

    const manager: AuthUserContext = {
      id: adminUser.id,
      phoneE164: adminUser.phoneE164,
      employee: {
        id: adminEmployee.id,
        displayName: adminEmployee.displayName,
        departmentId: department.id,
        departmentName: department.name,
        employmentRate: 1,
      },
      memberships: [
        {
          id: adminMembership.id,
          role: RoleType.DEPARTMENT_ADMIN,
          departmentId: department.id,
          permissions: [],
        },
      ],
    };

    return {
      department,
      otherDepartment,
      manager,
      targetUser,
      targetEmployee,
    };
  }

  it('creates, replaces and deactivates a DEPUTY assignment with immutable audit rows', async () => {
    const f = await fixture();

    const created = await service.createAssignment(f.manager, {
      employeeId: f.targetEmployee.id,
      departmentId: f.department.id,
      role: RoleType.DEPUTY,
      permissions: [PermissionCapability.SCHEDULE_READ],
    });

    expect(created).toMatchObject({
      role: RoleType.DEPUTY,
      departmentId: f.department.id,
      permissions: [PermissionCapability.SCHEDULE_READ],
      employee: {
        id: f.targetEmployee.id,
        displayName: f.targetEmployee.displayName,
      },
      isActive: true,
    });
    expect(JSON.stringify(created)).not.toContain(f.targetUser.id);
    expect(
      await prisma.membershipPermission.count({
        where: {
          membershipId: created.id,
          capability: PermissionCapability.SCHEDULE_READ,
        },
      }),
    ).toBe(1);

    const updated = await service.replacePermissions(
      f.manager,
      created.id,
      {
        permissions: [
          PermissionCapability.SCHEDULE_READ,
          PermissionCapability.SCHEDULE_EDIT,
        ],
        expectedUpdatedAt: created.updatedAt,
      },
    );
    expect(updated.permissions).toEqual([
      PermissionCapability.SCHEDULE_EDIT,
      PermissionCapability.SCHEDULE_READ,
    ]);

    const deactivated = await service.deactivate(
      f.manager,
      created.id,
      { expectedUpdatedAt: updated.updatedAt },
    );
    expect(deactivated).toEqual({
      status: 'ok',
      membershipId: created.id,
    });

    const stored = await prisma.membership.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.isActive).toBe(false);

    const audit = await prisma.auditLog.findMany({
      where: {
        entityType: AuditEntityType.MEMBERSHIP,
        entityId: created.id,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map(item => item.action)).toEqual([
      AuditAction.ROLE_ASSIGNMENT_CREATED,
      AuditAction.ROLE_PERMISSIONS_UPDATED,
      AuditAction.ROLE_ASSIGNMENT_DEACTIVATED,
    ]);
    expect(audit.every(item => item.departmentId === f.department.id)).toBe(
      true,
    );
  });

  it('enforces department and escalation boundaries', async () => {
    const f = await fixture();

    await expect(
      service.createAssignment(f.manager, {
        employeeId: f.targetEmployee.id,
        departmentId: f.department.id,
        role: RoleType.DEPARTMENT_ADMIN,
      }),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      service.createAssignment(f.manager, {
        employeeId: f.targetEmployee.id,
        departmentId: f.otherDepartment.id,
        role: RoleType.DEPUTY,
        permissions: [PermissionCapability.SCHEDULE_READ],
      }),
    ).rejects.toMatchObject({ status: 400 });

    const roleManagerUser = await prisma.user.create({
      data: { phoneE164: '+79995550003' },
    });
    const roleManagerEmployee = await prisma.employee.create({
      data: {
        displayName: 'Limited role manager',
        departmentId: f.department.id,
        userId: roleManagerUser.id,
      },
    });
    const roleManagerMembership = await prisma.membership.create({
      data: {
        userId: roleManagerUser.id,
        departmentId: f.department.id,
        role: RoleType.DEPUTY,
        permissions: {
          create: [
            { capability: PermissionCapability.ROLE_MANAGE },
            { capability: PermissionCapability.SCHEDULE_READ },
          ],
        },
      },
      include: { permissions: true },
    });

    const roleManager: AuthUserContext = {
      id: roleManagerUser.id,
      phoneE164: roleManagerUser.phoneE164,
      employee: {
        id: roleManagerEmployee.id,
        displayName: roleManagerEmployee.displayName,
        departmentId: f.department.id,
        departmentName: f.department.name,
        employmentRate: 1,
      },
      memberships: [
        {
          id: roleManagerMembership.id,
          role: roleManagerMembership.role,
          departmentId: roleManagerMembership.departmentId,
          permissions: roleManagerMembership.permissions.map(
            permission => permission.capability,
          ),
        },
      ],
    };

    await expect(
      service.createAssignment(roleManager, {
        employeeId: f.targetEmployee.id,
        departmentId: f.department.id,
        role: RoleType.DEPUTY,
        permissions: [PermissionCapability.EMPLOYEE_MANAGE],
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
