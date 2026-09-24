import { ConflictException } from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  RoleType,
  ScheduleRuleKind,
  ScheduleRuleScope,
  ScheduleRuleSeverity,
} from '@prisma/client';

import { AuthUserContext } from '../../../src/auth/auth.service';
import {
  SCHEDULE_PUBLICATION_RULES_VERSION,
} from '../../../src/schedules/schedule-publication-rules';
import { SchedulePublicationsService } from '../../../src/schedules/schedule-publications.service';

function admin(): AuthUserContext {
  return {
    id: 'user-admin',
    phoneE164: '+79991234567',
    employee: null,
    memberships: [
      {
        id: 'membership-admin',
        role: RoleType.DEPARTMENT_ADMIN,
        departmentId: 'department-a',
      },
    ],
  };
}

describe('SchedulePublicationsService', () => {
  const transaction = {
    department: { findFirst: jest.fn() },
    schedule: { upsert: jest.fn() },
    shift: { findMany: jest.fn() },
    scheduleRule: { findMany: jest.fn() },
    schedulePublication: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    scheduleRule: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };

  const prisma = {
    department: { findFirst: jest.fn() },
    schedule: { findUnique: jest.fn() },
    shift: { findMany: jest.fn() },
    schedulePublication: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };

  const authorization = {
    assertCanAdministerDepartment: jest.fn(),
  };

  const service = new SchedulePublicationsService(
    prisma as never,
    authorization as never,
  );

  const department = {
    id: 'department-a',
    name: 'Front Office',
    kind: 'FO',
    employees: [
      {
        id: 'employee-1',
        displayName: 'Employee 1',
        employmentRate: 1,
        scheduleMode: 'FIXED_WEEKDAYS',
        fixedStartTime: '08:00',
        fixedEndTime: '17:00',
        user: {
          memberships: [
            {
              role: RoleType.EMPLOYEE,
            },
          ],
        },
      },
    ],
  };

  const publishedEmployees = department.employees.map((employee) => ({
    id: employee.id,
    displayName: employee.displayName,
    employmentRate: employee.employmentRate,
    scheduleMode: employee.scheduleMode,
    fixedStartTime: employee.fixedStartTime,
    fixedEndTime: employee.fixedEndTime,
    roles: employee.user.memberships.map((membership) => membership.role),
  }));

  const shift = {
    id: 'shift-1',
    employeeId: 'employee-1',
    date: new Date('2026-09-07T00:00:00.000Z'),
    code: 'E',
    startTime: '08:00',
    endTime: '17:00',
    isOff: false,
    updatedAt: new Date('2026-09-01T11:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.department.findFirst.mockResolvedValue(department);
    transaction.schedule.upsert.mockResolvedValue({
      id: 'schedule-1',
      updatedAt: new Date('2026-09-01T12:00:00.000Z'),
    });
    transaction.shift.findMany.mockResolvedValue([shift]);
    transaction.schedulePublication.findFirst.mockResolvedValue(null);
    transaction.scheduleRule.findMany.mockResolvedValue([]);
    transaction.schedulePublication.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'publication-1',
        ...data,
        snapshot: data.snapshot,
        diff: data.diff,
        createdAt: new Date('2026-09-02T09:00:00.000Z'),
      }),
    );
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    prisma.department.findFirst.mockResolvedValue(department);
    prisma.schedule.findUnique.mockResolvedValue({ id: 'schedule-1' });
    prisma.shift.findMany.mockResolvedValue([shift]);
    prisma.scheduleRule.findMany.mockResolvedValue([]);
  });

  it('returns structured validation result without creating a publication', async () => {
    const currentUser = admin();

    const result = await service.validateDepartmentSchedule(
      currentUser,
      'department-a',
      2026,
      9,
    );

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenCalledWith(currentUser, 'department-a');
    expect(result).toEqual({
      departmentId: 'department-a',
      period: { year: 2026, month: 9 },
      rulesVersion: SCHEDULE_PUBLICATION_RULES_VERSION,
      canPublish: true,
      violations: [],
    });
    expect(transaction.schedulePublication.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns hard violations and blocks publish readiness for an invalid draft', async () => {
    prisma.shift.findMany.mockResolvedValue([
      {
        ...shift,
        startTime: '08:00',
        endTime: '08:00',
      },
    ]);

    const result = await service.validateDepartmentSchedule(
      admin(),
      'department-a',
      2026,
      9,
    );

    expect(result.canPublish).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'hard',
          code: 'ZERO_DURATION_SHIFT',
          employeeId: 'employee-1',
          date: '2026-09-07',
        }),
      ]),
    );
  });

  it('publishes version 1 with author, snapshot, diff and audit event', async () => {
    const currentUser = admin();

    const result = await service.publishDepartmentSchedule(
      currentUser,
      'department-a',
      2026,
      9,
      'Утверждено',
    );

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenCalledWith(currentUser, 'department-a');
    expect(transaction.schedulePublication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scheduleId: 'schedule-1',
          departmentId: 'department-a',
          version: 1,
          publishedByUserId: 'user-admin',
          comment: 'Утверждено',
          rulesVersion: SCHEDULE_PUBLICATION_RULES_VERSION,
          rulesSnapshot: {
            baselineVersion: SCHEDULE_PUBLICATION_RULES_VERSION,
            managedRules: [],
          },
        }),
      }),
    );
    const createCall = transaction.schedulePublication.create.mock.calls[0][0];
    expect(createCall.data.snapshot).toEqual(
      expect.objectContaining({
        department: expect.objectContaining({ id: 'department-a' }),
        employees: [
          expect.objectContaining({
            id: 'employee-1',
            scheduleMode: 'FIXED_WEEKDAYS',
          }),
        ],
        shifts: [
          expect.objectContaining({
            id: 'shift-1',
            date: '2026-09-07',
          }),
        ],
      }),
    );
    expect(createCall.data.diff).toEqual(
      expect.objectContaining({
        employees: expect.any(Array),
        shifts: expect.any(Array),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'user-admin',
        action: AuditAction.SCHEDULE_PUBLISHED,
        entityType: AuditEntityType.SCHEDULE,
        entityId: 'schedule-1',
        departmentId: 'department-a',
      },
      select: { id: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'publication-1',
        version: 1,
        publishedByUserId: 'user-admin',
      }),
    );
  });

  it('includes managed hard rules in publication readiness and blocks publish', async () => {
    const managedRule = {
      id: 'rule-opening',
      name: 'Открытие',
      description: 'К 07:00 нужен сотрудник',
      kind: ScheduleRuleKind.MIN_STAFF_AT_TIME,
      scope: ScheduleRuleScope.DEPARTMENT,
      scopeValue: null,
      departmentId: 'department-a',
      priority: 200,
      severity: ScheduleRuleSeverity.HARD,
      isActive: true,
      isDeleted: false,
      config: { time: '07:00', minStaff: 1 },
      violationMessage: 'Нет сотрудника к 07:00.',
      version: 1,
    };
    prisma.scheduleRule.findMany.mockResolvedValue([managedRule]);
    transaction.scheduleRule.findMany.mockResolvedValue([managedRule]);

    const validation = await service.validateDepartmentSchedule(
      admin(),
      'department-a',
      2026,
      9,
    );

    expect(validation.canPublish).toBe(false);
    expect(validation.rulesVersion).toMatch(
      /^schedule-publication-rules-v1\+managed-/,
    );
    expect(validation.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'hard',
          code: 'MANAGED_MIN_STAFF_AT_TIME',
        }),
      ]),
    );

    await expect(
      service.publishDepartmentSchedule(
        admin(),
        'department-a',
        2026,
        9,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SCHEDULE_PUBLICATION_RULES_FAILED',
      }),
    });
    expect(transaction.schedulePublication.create).not.toHaveBeenCalled();
  });

  it('stores an immutable managed-rules snapshot and derived rules version', async () => {
    transaction.scheduleRule.findMany.mockResolvedValue([
      {
        id: 'rule-max-fo',
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
        violationMessage: 'Превышен лимит.',
        version: 3,
        createdByUserId: 'user-admin',
        updatedByUserId: 'user-admin',
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
        updatedAt: new Date('2026-09-24T10:00:00.000Z'),
      },
    ]);

    await service.publishDepartmentSchedule(
      admin(),
      'department-a',
      2026,
      9,
    );

    const createCall = transaction.schedulePublication.create.mock.calls[0][0];
    expect(createCall.data.rulesVersion).toMatch(
      /^schedule-publication-rules-v1\+managed-[a-f0-9]{16}$/,
    );
    expect(createCall.data.rulesSnapshot).toEqual({
      baselineVersion: SCHEDULE_PUBLICATION_RULES_VERSION,
      managedRules: [
        expect.objectContaining({
          id: 'rule-max-fo',
          version: 3,
          config: { maxConcurrent: 5 },
        }),
      ],
    });
    expect(createCall.data.rulesSnapshot.managedRules[0]).not.toHaveProperty(
      'updatedAt',
    );
  });

  it('blocks publication before create/audit when hard publication rules fail', async () => {
    transaction.shift.findMany.mockResolvedValue([
      {
        ...shift,
        startTime: '08:00',
        endTime: '08:00',
      },
    ]);

    await expect(
      service.publishDepartmentSchedule(
        admin(),
        'department-a',
        2026,
        9,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SCHEDULE_PUBLICATION_RULES_FAILED',
        rulesVersion: SCHEDULE_PUBLICATION_RULES_VERSION,
        violations: expect.arrayContaining([
          expect.objectContaining({
            code: 'ZERO_DURATION_SHIFT',
            shiftId: 'shift-1',
          }),
        ]),
      }),
    });

    expect(transaction.schedulePublication.findFirst).not.toHaveBeenCalled();
    expect(transaction.schedulePublication.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('creates the next immutable version with a cell diff', async () => {
    transaction.schedulePublication.findFirst.mockResolvedValue({
      version: 1,
      snapshot: {
        department: { id: 'department-a', name: 'Front Office', kind: 'FO' },
        employees: publishedEmployees,
        shifts: [
          {
            id: 'shift-1',
            employeeId: 'employee-1',
            date: '2026-09-07',
            code: 'E',
            startTime: '09:00',
            endTime: '18:00',
            isOff: false,
            updatedAt: '2026-09-01T10:00:00.000Z',
          },
        ],
      },
    });

    await service.publishDepartmentSchedule(
      admin(),
      'department-a',
      2026,
      9,
    );

    const createCall = transaction.schedulePublication.create.mock.calls[0][0];
    expect(createCall.data.version).toBe(2);
    expect(createCall.data.diff.shifts).toEqual([
      expect.objectContaining({
        key: 'employee-1:2026-09-07',
        before: expect.objectContaining({ startTime: '09:00' }),
        after: expect.objectContaining({ startTime: '08:00' }),
      }),
    ]);
  });

  it('preserves the published employment rate and records a later rate change as version diff', async () => {
    const previousEmployees = [
      {
        ...publishedEmployees[0],
        employmentRate: 0.75,
      },
    ];
    const previousSnapshot = {
      department: { id: 'department-a', name: 'Front Office', kind: 'FO' },
      employees: previousEmployees,
      shifts: [
        {
          id: 'shift-1',
          employeeId: 'employee-1',
          date: '2026-09-07',
          code: 'E',
          startTime: '08:00',
          endTime: '17:00',
          isOff: false,
          updatedAt: '2026-09-01T11:00:00.000Z',
        },
      ],
    };

    transaction.schedulePublication.findFirst.mockResolvedValue({
      version: 1,
      snapshot: previousSnapshot,
    });

    await service.publishDepartmentSchedule(
      admin(),
      'department-a',
      2026,
      9,
    );

    const createCall = transaction.schedulePublication.create.mock.calls[0][0];
    expect(createCall.data.version).toBe(2);
    expect(createCall.data.snapshot.employees[0]).toEqual(
      expect.objectContaining({
        id: 'employee-1',
        employmentRate: 1,
      }),
    );
    expect(createCall.data.diff.employees).toEqual([
      expect.objectContaining({
        key: 'employee-1',
        before: expect.objectContaining({ employmentRate: 0.75 }),
        after: expect.objectContaining({ employmentRate: 1 }),
      }),
    ]);

    expect(previousSnapshot.employees[0].employmentRate).toBe(0.75);
  });

  it('rejects publishing again when the immutable snapshot did not change', async () => {
    transaction.schedulePublication.findFirst.mockResolvedValue({
      version: 1,
      snapshot: {
        department: { id: 'department-a', name: 'Front Office', kind: 'FO' },
        employees: publishedEmployees,
        shifts: [
          {
            id: 'shift-1',
            employeeId: 'employee-1',
            date: '2026-09-07',
            code: 'E',
            startTime: '08:00',
            endTime: '17:00',
            isOff: false,
            updatedAt: '2026-09-01T11:00:00.000Z',
          },
        ],
      },
    });

    await expect(
      service.publishDepartmentSchedule(
        admin(),
        'department-a',
        2026,
        9,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.schedulePublication.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('enforces management scope before listing publication history', async () => {
    prisma.department.findFirst.mockResolvedValue({ id: 'department-a' });
    prisma.schedule.findUnique.mockResolvedValue({ id: 'schedule-1' });
    prisma.schedulePublication.findMany.mockResolvedValue([]);

    const currentUser = admin();
    await service.listDepartmentPublications(
      currentUser,
      'department-a',
      2026,
      9,
    );

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenCalledWith(currentUser, 'department-a');
  });
});
