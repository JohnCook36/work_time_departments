import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  PermissionCapability,
  RoleType,
} from '@prisma/client';

import type { AuthUserContext } from '../../src/auth/auth.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import { MembershipsService } from '../../src/memberships/memberships.service';

function createPrismaMock() {
  const prisma: any = {
    employee: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
    membership: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    membershipPermission: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ locked: 1 }]),
  };
  prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
  return prisma;
}

const departmentAdmin: AuthUserContext = {
  id: 'admin-user',
  phoneE164: '+79990000001',
  employee: null,
  memberships: [
    {
      id: 'admin-membership',
      role: RoleType.DEPARTMENT_ADMIN,
      departmentId: 'department-a',
      permissions: [],
    },
  ],
};

const deputyManager: AuthUserContext = {
  id: 'deputy-manager',
  phoneE164: '+79990000002',
  employee: null,
  memberships: [
    {
      id: 'deputy-manager-membership',
      role: RoleType.DEPUTY,
      departmentId: 'department-a',
      permissions: [PermissionCapability.ROLE_MANAGE],
    },
  ],
};

describe('MembershipsService role assignment lifecycle', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: MembershipsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new MembershipsService(
      prisma,
      new AuthorizationService(),
    );
    prisma.department.findFirst.mockResolvedValue({ id: 'department-a' });
    prisma.employee.findFirst.mockResolvedValue({
      id: 'employee-target',
      departmentId: 'department-a',
      userId: 'target-user',
    });
    prisma.membership.findFirst.mockResolvedValue(null);
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('creates scoped DEPUTY capabilities and writes minimal AuditLog', async () => {
    prisma.membership.create.mockResolvedValue({
      id: 'membership-target',
      role: RoleType.DEPUTY,
      departmentId: 'department-a',
      isActive: true,
      updatedAt: new Date('2026-09-25T12:00:00.000Z'),
      permissions: [
        { capability: PermissionCapability.SCHEDULE_READ },
      ],
      user: {
        employee: {
          id: 'employee-target',
          displayName: 'Target employee',
        },
      },
    });

    const result = await service.createAssignment(departmentAdmin, {
      employeeId: 'employee-target',
      departmentId: 'department-a',
      role: RoleType.DEPUTY,
      permissions: [PermissionCapability.SCHEDULE_READ],
    });

    expect(result).toEqual({
      id: 'membership-target',
      role: RoleType.DEPUTY,
      departmentId: 'department-a',
      permissions: [PermissionCapability.SCHEDULE_READ],
      employee: {
        id: 'employee-target',
        displayName: 'Target employee',
      },
      isActive: true,
      updatedAt: '2026-09-25T12:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('target-user');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: departmentAdmin.id,
        action: AuditAction.ROLE_ASSIGNMENT_CREATED,
        entityType: AuditEntityType.MEMBERSHIP,
        entityId: 'membership-target',
        departmentId: 'department-a',
      },
      select: { id: true },
    });
  });

  it('blocks Department Admin from assigning another DEPARTMENT_ADMIN', async () => {
    await expect(
      service.createAssignment(departmentAdmin, {
        employeeId: 'employee-target',
        departmentId: 'department-a',
        role: RoleType.DEPARTMENT_ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  it('prevents a ROLE_MANAGE deputy from granting capabilities they do not have', async () => {
    await expect(
      service.createAssignment(deputyManager, {
        employeeId: 'employee-target',
        departmentId: 'department-a',
        role: RoleType.DEPUTY,
        permissions: [PermissionCapability.EMPLOYEE_MANAGE],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  it('blocks self assignment and duplicate active assignment', async () => {
    prisma.employee.findFirst.mockResolvedValueOnce({
      id: 'employee-admin',
      departmentId: 'department-a',
      userId: departmentAdmin.id,
    });

    await expect(
      service.createAssignment(departmentAdmin, {
        employeeId: 'employee-admin',
        departmentId: 'department-a',
        role: RoleType.DEPUTY,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.employee.findFirst.mockResolvedValueOnce({
      id: 'employee-target',
      departmentId: 'department-a',
      userId: 'target-user',
    });
    prisma.membership.findFirst.mockResolvedValueOnce({ id: 'existing' });

    await expect(
      service.createAssignment(departmentAdmin, {
        employeeId: 'employee-target',
        departmentId: 'department-a',
        role: RoleType.DEPUTY,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('replaces DEPUTY permissions with optimistic concurrency and audit', async () => {
    const version = new Date('2026-09-25T12:00:00.000Z');
    prisma.membership.findUnique.mockResolvedValue({
      id: 'membership-target',
      userId: 'target-user',
      role: RoleType.DEPUTY,
      departmentId: 'department-a',
      isActive: true,
      updatedAt: version,
    });
    prisma.membership.updateMany.mockResolvedValue({ count: 1 });
    prisma.membership.findUniqueOrThrow.mockResolvedValue({
      id: 'membership-target',
      role: RoleType.DEPUTY,
      departmentId: 'department-a',
      isActive: true,
      updatedAt: new Date('2026-09-25T12:01:00.000Z'),
      permissions: [
        { capability: PermissionCapability.SCHEDULE_READ },
        { capability: PermissionCapability.SCHEDULE_EDIT },
      ],
      user: {
        employee: {
          id: 'employee-target',
          displayName: 'Target employee',
        },
      },
    });

    const result = await service.replacePermissions(
      departmentAdmin,
      'membership-target',
      {
        permissions: [
          PermissionCapability.SCHEDULE_EDIT,
          PermissionCapability.SCHEDULE_READ,
        ],
        expectedUpdatedAt: version.toISOString(),
      },
    );

    expect(result.permissions).toEqual([
      PermissionCapability.SCHEDULE_READ,
      PermissionCapability.SCHEDULE_EDIT,
    ].sort());
    expect(prisma.membershipPermission.deleteMany).toHaveBeenCalledWith({
      where: { membershipId: 'membership-target' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.ROLE_PERMISSIONS_UPDATED,
          entityType: AuditEntityType.MEMBERSHIP,
        }),
      }),
    );
  });

  it('blocks self-deactivation', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: 'admin-membership',
      userId: departmentAdmin.id,
      role: RoleType.DEPARTMENT_ADMIN,
      departmentId: 'department-a',
      isActive: true,
      updatedAt: new Date('2026-09-25T12:00:00.000Z'),
    });

    await expect(
      service.deactivate(departmentAdmin, 'admin-membership', {
        expectedUpdatedAt: '2026-09-25T12:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
