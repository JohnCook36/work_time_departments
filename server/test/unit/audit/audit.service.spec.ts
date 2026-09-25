import { ForbiddenException } from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  PermissionCapability,
  RoleType,
} from '@prisma/client';

import type { AuthUserContext } from '../../../src/auth/auth.service';
import { AuditService } from '../../../src/audit/audit.service';
import { AuthorizationService } from '../../../src/auth/authorization.service';

function createPrismaMock() {
  return {
    auditLog: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  } as any;
}

const departmentAdmin: AuthUserContext = {
  id: 'admin-user',
  phoneE164: '+79990000001',
  employee: null,
  memberships: [
    {
      id: 'membership-admin',
      role: RoleType.DEPARTMENT_ADMIN,
      departmentId: 'department-a',
      permissions: [],
    },
  ],
};

const employee: AuthUserContext = {
  id: 'employee-user',
  phoneE164: '+79990000002',
  employee: null,
  memberships: [
    {
      id: 'membership-employee',
      role: RoleType.EMPLOYEE,
      departmentId: 'department-a',
      permissions: [],
    },
  ],
};

describe('AuditService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let authorization: AuthorizationService;
  let service: AuditService;

  beforeEach(() => {
    prisma = createPrismaMock();
    authorization = new AuthorizationService();
    service = new AuditService(prisma, authorization);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
  });

  it('limits a department admin to its department and does not expose actorUserId', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        actorUserId: 'actor-user',
        action: AuditAction.SCHEDULE_PUBLISHED,
        entityType: AuditEntityType.SCHEDULE,
        entityId: 'schedule-1',
        departmentId: 'department-a',
        createdAt: new Date('2026-09-25T12:00:00.000Z'),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'actor-user',
        employee: { displayName: 'Администратор FO' },
      },
    ]);

    const result = await service.list(departmentAdmin, { limit: '30' });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          departmentId: { in: ['department-a'] },
        }),
        take: 31,
      }),
    );
    expect(result.items).toEqual([
      {
        id: 'audit-1',
        action: AuditAction.SCHEDULE_PUBLISHED,
        entityType: AuditEntityType.SCHEDULE,
        entityId: 'schedule-1',
        departmentId: 'department-a',
        actorLabel: 'Администратор FO',
        createdAt: '2026-09-25T12:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('actor-user');
  });

  it('denies a user without AUDIT_READ capability', async () => {
    await expect(service.list(employee, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('allows a DEPUTY only in a department with explicit AUDIT_READ', async () => {
    const deputy: AuthUserContext = {
      ...employee,
      id: 'deputy-user',
      memberships: [
        {
          id: 'membership-deputy',
          role: RoleType.DEPUTY,
          departmentId: 'department-b',
          permissions: [PermissionCapability.AUDIT_READ],
        },
      ],
    };

    await service.list(deputy, { departmentId: 'department-b' });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ departmentId: 'department-b' }),
      }),
    );

    await expect(
      service.list(deputy, { departmentId: 'department-a' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses a scope-checked cursor and returns nextCursor without leaking actor ids', async () => {
    prisma.auditLog.findFirst.mockResolvedValue({
      id: 'audit-cursor',
      createdAt: new Date('2026-09-25T11:00:00.000Z'),
    });
    prisma.auditLog.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) => ({
        id: 'audit-' + index,
        actorUserId: 'actor-' + index,
        action: AuditAction.SCHEDULE_CHANGED,
        entityType: AuditEntityType.SCHEDULE,
        entityId: 'schedule-' + index,
        departmentId: 'department-a',
        createdAt: new Date(
          Date.parse('2026-09-25T10:00:00.000Z') - index * 1000,
        ),
      })),
    );
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.list(departmentAdmin, {
      cursor: 'audit-cursor',
      limit: 2,
    });

    expect(prisma.auditLog.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'audit-cursor',
        departmentId: { in: ['department-a'] },
      },
      select: { id: true, createdAt: true },
    });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe('audit-1');
    expect(result.items.every(item => item.actorLabel === 'Администратор')).toBe(
      true,
    );
  });
});
