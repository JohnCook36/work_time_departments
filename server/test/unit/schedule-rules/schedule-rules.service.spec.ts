import {
  AuditAction,
  AuditEntityType,
  RoleType,
  ScheduleRuleKind,
  ScheduleRuleScope,
  ScheduleRuleSeverity,
} from '@prisma/client';

import type { AuthUserContext } from '../../../src/auth/auth.service';
import { ScheduleRulesService } from '../../../src/schedule-rules/schedule-rules.service';

function departmentAdmin(): AuthUserContext {
  return {
    id: 'user-admin',
    phoneE164: '+79990000001',
    employee: null,
    memberships: [
      {
        id: 'membership-a',
        role: RoleType.DEPARTMENT_ADMIN,
        departmentId: 'department-a',
      },
    ],
  };
}

function superAdmin(): AuthUserContext {
  return {
    id: 'user-super',
    phoneE164: '+79990000002',
    employee: null,
    memberships: [
      {
        id: 'membership-super',
        role: RoleType.SUPER_ADMIN,
        departmentId: null,
      },
    ],
  };
}

function ruleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    name: 'Максимум FO',
    description: 'Не больше пяти сотрудников одновременно',
    kind: ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES,
    scope: ScheduleRuleScope.DEPARTMENT,
    scopeValue: null,
    departmentId: 'department-a',
    priority: 100,
    severity: ScheduleRuleSeverity.HARD,
    isActive: true,
    isDeleted: false,
    config: { maxConcurrent: 5 },
    violationMessage: 'Превышено максимальное число сотрудников.',
    version: 1,
    createdByUserId: 'user-admin',
    updatedByUserId: 'user-admin',
    createdAt: new Date('2026-09-24T20:00:00.000Z'),
    updatedAt: new Date('2026-09-24T20:00:00.000Z'),
    ...overrides,
  };
}

describe('ScheduleRulesService', () => {
  const transaction = {
    scheduleRule: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    scheduleRuleVersion: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const prisma = {
    department: {
      findFirst: jest.fn(),
    },
    scheduleRule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    scheduleRuleVersion: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };

  const assertCanAdministerDepartment = jest.fn();
  const canAdministerDepartment = jest.fn();
  const authorization = {
    assertCanAdministerDepartment,
    canAdministerDepartment,
    assertCapability: jest.fn(
      (user: AuthUserContext, _capability: unknown, departmentId: string) =>
        assertCanAdministerDepartment(user, departmentId),
    ),
    hasCapability: jest.fn(
      (user: AuthUserContext, _capability: unknown, departmentId: string) =>
        canAdministerDepartment(user, departmentId),
    ),
    isSuperAdmin: jest.fn((user: AuthUserContext) =>
      user.memberships.some(
        membership => membership.role === 'SUPER_ADMIN',
      ),
    ),
    departmentIdsForCapability: jest.fn((user: AuthUserContext) =>
      user.memberships
        .filter(
          membership =>
            membership.role === 'DEPARTMENT_ADMIN' &&
            membership.departmentId,
        )
        .map(membership => membership.departmentId as string),
    ),
  };

  const service = new ScheduleRulesService(
    prisma as never,
    authorization as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    authorization.canAdministerDepartment.mockReturnValue(true);
    prisma.department.findFirst.mockResolvedValue({ id: 'department-a' });
    transaction.scheduleRule.create.mockResolvedValue(ruleRow());
    transaction.scheduleRuleVersion.create.mockResolvedValue({
      id: 'version-1',
    });
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    transaction.user.findUnique.mockResolvedValue({
      isActive: true,
      memberships: [
        {
          id: 'membership-a',
          role: RoleType.DEPARTMENT_ADMIN,
          departmentId: 'department-a',
          permissions: [],
        },
      ],
    });
  });

  it('idempotently applies the standard FO preset without overwriting existing preset rules', async () => {
    prisma.department.findFirst.mockResolvedValue({
      id: 'department-a',
      kind: 'FO',
    });
    transaction.scheduleRule.findMany.mockResolvedValue([
      ruleRow({
        id: 'existing-max',
        name: 'Стандарт FO · максимум 5 одновременно',
      }),
    ]);
    transaction.$queryRaw.mockResolvedValue([{ locked: 1 }]);
    transaction.scheduleRule.create.mockResolvedValue(
      ruleRow({
        id: 'preset-opening',
        name: 'Стандарт FO · 2 сотрудника к 07:00',
        kind: ScheduleRuleKind.MIN_STAFF_AT_TIME,
        config: { time: '07:00', minStaff: 2 },
        priority: 900,
      }),
    );

    const result = await service.applyFoPreset(
      departmentAdmin(),
      'department-a',
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        departmentId: 'department-a',
        created: 1,
        existing: 1,
      }),
    );
    expect(transaction.scheduleRule.create).toHaveBeenCalledTimes(1);
    expect(transaction.scheduleRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Стандарт FO · 2 сотрудника к 07:00',
        departmentId: 'department-a',
        scope: ScheduleRuleScope.DEPARTMENT,
        severity: ScheduleRuleSeverity.HARD,
        priority: 900,
        config: { time: '07:00', minStaff: 2 },
      }),
    });
    expect(transaction.scheduleRuleVersion.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.SCHEDULE_RULE_CREATED,
        entityType: AuditEntityType.SCHEDULE_RULE,
        entityId: 'preset-opening',
        departmentId: 'department-a',
      }),
      select: { id: true },
    });
  });

  it('rejects FO preset for a non-FO department', async () => {
    prisma.department.findFirst.mockResolvedValue({
      id: 'department-a',
      kind: 'NIGHT',
    });

    await expect(
      service.applyFoPreset(departmentAdmin(), 'department-a'),
    ).rejects.toThrow(
      'FO preset is available only for Front Office departments',
    );

    expect(transaction.scheduleRule.create).not.toHaveBeenCalled();
  });

  it('creates a department rule with version 1 and audit trail', async () => {
    const currentUser = departmentAdmin();

    const result = await service.createRule(currentUser, {
      name: 'Максимум FO',
      description: 'Не больше пяти сотрудников одновременно',
      kind: ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES,
      scope: ScheduleRuleScope.DEPARTMENT,
      departmentId: 'department-a',
      priority: 100,
      severity: ScheduleRuleSeverity.HARD,
      isActive: true,
      config: { maxConcurrent: 5 },
      violationMessage: 'Превышено максимальное число сотрудников.',
    });

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenCalledWith(currentUser, 'department-a');
    expect(transaction.scheduleRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        departmentId: 'department-a',
        scope: ScheduleRuleScope.DEPARTMENT,
        config: { maxConcurrent: 5 },
        createdByUserId: 'user-admin',
        updatedByUserId: 'user-admin',
      }),
    });
    expect(transaction.scheduleRuleVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ruleId: 'rule-1',
        version: 1,
        changedByUserId: 'user-admin',
        snapshot: expect.objectContaining({
          id: 'rule-1',
          version: 1,
        }),
      }),
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'user-admin',
        action: AuditAction.SCHEDULE_RULE_CREATED,
        entityType: AuditEntityType.SCHEDULE_RULE,
        entityId: 'rule-1',
        departmentId: 'department-a',
      },
      select: { id: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'rule-1',
        editable: true,
      }),
    );
  });

  it('forbids a department admin from creating organization rules', async () => {
    await expect(
      service.createRule(departmentAdmin(), {
        name: 'Global rule',
        description: 'Global description',
        kind: ScheduleRuleKind.MAX_CONCURRENT_EMPLOYEES,
        scope: ScheduleRuleScope.ORGANIZATION,
        config: { maxConcurrent: 5 },
        violationMessage: 'Global violation',
      }),
    ).rejects.toThrow(
      'Only SUPER_ADMIN can manage organization, role or shift-type rules',
    );

    expect(transaction.scheduleRule.create).not.toHaveBeenCalled();
  });

  it('allows SUPER_ADMIN to create role-scoped rules', async () => {
    transaction.scheduleRule.create.mockResolvedValue(
      ruleRow({
        scope: ScheduleRuleScope.ROLE,
        scopeValue: RoleType.EMPLOYEE,
        departmentId: null,
        createdByUserId: 'user-super',
        updatedByUserId: 'user-super',
      }),
    );

    transaction.user.findUnique.mockResolvedValueOnce({
      isActive: true,
      memberships: [
        {
          id: 'membership-super',
          role: RoleType.SUPER_ADMIN,
          departmentId: null,
          permissions: [],
        },
      ],
    });

    await service.createRule(superAdmin(), {
      name: 'Employee coverage',
      description: 'Rule for employee role',
      kind: ScheduleRuleKind.MIN_STAFF_AT_TIME,
      scope: ScheduleRuleScope.ROLE,
      scopeValue: RoleType.EMPLOYEE,
      config: { time: '07:00', minStaff: 1 },
      violationMessage: 'Нужен сотрудник к 07:00.',
    });

    expect(
      authorization.assertCanAdministerDepartment,
    ).not.toHaveBeenCalled();
    expect(transaction.scheduleRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: ScheduleRuleScope.ROLE,
        scopeValue: RoleType.EMPLOYEE,
        departmentId: null,
        config: { time: '07:00', minStaff: 1 },
      }),
    });
  });

  it('increments the rule version and writes immutable history on update', async () => {
    const current = ruleRow();
    const updated = ruleRow({
      name: 'Максимум FO обновлён',
      version: 2,
      updatedAt: new Date('2026-09-24T21:00:00.000Z'),
    });
    prisma.scheduleRule.findFirst.mockResolvedValue(current);
    transaction.scheduleRule.updateMany.mockResolvedValue({ count: 1 });
    transaction.scheduleRule.findUnique.mockResolvedValue(updated);

    const result = await service.updateRule(
      departmentAdmin(),
      'rule-1',
      {
        name: 'Максимум FO обновлён',
        expectedUpdatedAt: '2026-09-24T20:00:00.000Z',
      },
    );

    expect(transaction.scheduleRule.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'rule-1',
        isDeleted: false,
        updatedAt: new Date('2026-09-24T20:00:00.000Z'),
      },
      data: expect.objectContaining({
        name: 'Максимум FO обновлён',
        version: { increment: 1 },
        updatedByUserId: 'user-admin',
      }),
    });
    expect(transaction.scheduleRuleVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ruleId: 'rule-1',
        version: 2,
        snapshot: expect.objectContaining({
          name: 'Максимум FO обновлён',
          version: 2,
        }),
      }),
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.SCHEDULE_RULE_UPDATED,
        entityType: AuditEntityType.SCHEDULE_RULE,
      }),
      select: { id: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        version: 2,
        editable: true,
      }),
    );
  });

  it('rejects rule update when current schedule-rule scope was revoked', async () => {
    prisma.scheduleRule.findFirst.mockResolvedValue(ruleRow());
    transaction.user.findUnique.mockResolvedValueOnce({
      isActive: true,
      memberships: [],
    });
    authorization.canAdministerDepartment.mockImplementation(
      (user: AuthUserContext) =>
        user.memberships.some(
          membership =>
            membership.role === RoleType.DEPARTMENT_ADMIN &&
            membership.departmentId === 'department-a',
        ),
    );

    await expect(
      service.updateRule(departmentAdmin(), 'rule-1', {
        name: 'Нельзя изменить',
        expectedUpdatedAt: '2026-09-24T20:00:00.000Z',
      }),
    ).rejects.toThrow('You do not have permission to edit this rule');

    expect(transaction.scheduleRule.updateMany).not.toHaveBeenCalled();
    expect(transaction.scheduleRuleVersion.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects a stale optimistic rule update', async () => {
    prisma.scheduleRule.findFirst.mockResolvedValue(ruleRow());
    transaction.scheduleRule.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateRule(departmentAdmin(), 'rule-1', {
        name: 'Stale',
        expectedUpdatedAt: '2026-09-24T19:00:00.000Z',
      }),
    ).rejects.toThrow(
      'Schedule rule changed concurrently; refresh and retry',
    );

    expect(transaction.scheduleRuleVersion.create).not.toHaveBeenCalled();
  });

  it('soft-deletes a rule and records deletion as a new immutable version', async () => {
    const current = ruleRow();
    const deleted = ruleRow({
      isDeleted: true,
      isActive: false,
      version: 2,
      updatedAt: new Date('2026-09-24T21:00:00.000Z'),
    });
    prisma.scheduleRule.findFirst.mockResolvedValue(current);
    transaction.scheduleRule.updateMany.mockResolvedValue({ count: 1 });
    transaction.scheduleRule.findUnique.mockResolvedValue(deleted);

    const result = await service.deleteRule(
      departmentAdmin(),
      'rule-1',
      '2026-09-24T20:00:00.000Z',
    );

    expect(transaction.scheduleRule.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'rule-1',
        isDeleted: false,
        updatedAt: new Date('2026-09-24T20:00:00.000Z'),
      },
      data: {
        isDeleted: true,
        isActive: false,
        version: { increment: 1 },
        updatedByUserId: 'user-admin',
      },
    });
    expect(transaction.scheduleRuleVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 2,
        snapshot: expect.objectContaining({
          isDeleted: true,
          isActive: false,
        }),
      }),
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.SCHEDULE_RULE_DELETED,
      }),
      select: { id: true },
    });
    expect(result).toEqual({ status: 'ok', ruleId: 'rule-1' });
  });

  it('lists global rules read-only for a department admin and own department rules editable', async () => {
    prisma.scheduleRule.findMany.mockResolvedValue([
      ruleRow({
        id: 'global-rule',
        scope: ScheduleRuleScope.ORGANIZATION,
        departmentId: null,
      }),
      ruleRow(),
    ]);

    const result = await service.listManageable(departmentAdmin());

    expect(result).toEqual([
      expect.objectContaining({ id: 'global-rule', editable: false }),
      expect.objectContaining({ id: 'rule-1', editable: true }),
    ]);
  });

  it('returns immutable version history for a visible rule', async () => {
    prisma.scheduleRule.findUnique.mockResolvedValue(ruleRow());
    prisma.scheduleRuleVersion.findMany.mockResolvedValue([
      {
        id: 'version-2',
        version: 2,
        snapshot: {
          version: 2,
          createdByUserId: 'user-original',
          updatedByUserId: 'user-admin',
        },
        changedBy: { employee: { displayName: 'Администратор правил' } },
        createdAt: new Date('2026-09-24T21:00:00.000Z'),
      },
      {
        id: 'version-1',
        version: 1,
        snapshot: {
          version: 1,
          createdByUserId: 'user-original',
          updatedByUserId: 'user-original',
        },
        changedBy: { employee: null },
        createdAt: new Date('2026-09-24T20:00:00.000Z'),
      },
    ]);

    const result = await service.getHistory(departmentAdmin(), 'rule-1');

    expect(result).toEqual([
      expect.objectContaining({
        version: 2,
        changedByLabel: 'Администратор правил',
        createdAt: '2026-09-24T21:00:00.000Z',
      }),
      expect.objectContaining({
        version: 1,
        changedByLabel: 'Администратор',
        createdAt: '2026-09-24T20:00:00.000Z',
      }),
    ]);
    expect(result[0]).not.toHaveProperty('changedByUserId');
    expect(result[0].snapshot).not.toHaveProperty('createdByUserId');
    expect(result[0].snapshot).not.toHaveProperty('updatedByUserId');
  });
});
