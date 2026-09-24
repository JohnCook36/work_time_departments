import { ConflictException } from '@nestjs/common';
import { AuditAction, AuditEntityType, RoleType } from '@prisma/client';

import { AuthUserContext } from '../../../src/auth/auth.service';
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
    schedulePublication: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };

  const prisma = {
    department: { findFirst: jest.fn() },
    schedule: { findUnique: jest.fn() },
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
      },
    ],
  };

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
  });

  it('publishes version 1 with author, snapshot, diff and audit event', async () => {
    const currentUser = admin();

    const result = await service.publishDepartmentSchedule(
      currentUser,
      'department-a',
      2026,
      9,
      'Утверждено',
      'rules-1',
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
          rulesVersion: 'rules-1',
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

  it('creates the next immutable version with a cell diff', async () => {
    transaction.schedulePublication.findFirst.mockResolvedValue({
      version: 1,
      snapshot: {
        department: { id: 'department-a', name: 'Front Office', kind: 'FO' },
        employees: department.employees,
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

  it('rejects publishing again when the immutable snapshot did not change', async () => {
    transaction.schedulePublication.findFirst.mockResolvedValue({
      version: 1,
      snapshot: {
        department: { id: 'department-a', name: 'Front Office', kind: 'FO' },
        employees: department.employees,
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
