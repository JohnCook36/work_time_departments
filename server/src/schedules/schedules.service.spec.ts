import { BadRequestException, ConflictException } from '@nestjs/common';
import { RoleType } from '@prisma/client';

import { AuthUserContext } from '../auth/auth.service';
import { SchedulesService } from './schedules.service';

function user(overrides: Partial<AuthUserContext> = {}): AuthUserContext {
  return {
    id: 'user-1',
    phoneE164: '+79991234567',
    employee: {
      id: 'employee-1',
      displayName: 'Employee',
      departmentId: 'department-a',
      employmentRate: 1,
    },
    memberships: [
      {
        id: 'membership-1',
        role: RoleType.DEPARTMENT_ADMIN,
        departmentId: 'department-a',
      },
    ],
    ...overrides,
  };
}

describe('SchedulesService', () => {
  const transaction = {
    employee: {
      findMany: jest.fn(),
    },
    schedule: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const prisma = {
    department: {
      findFirst: jest.fn(),
    },
    employee: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    schedule: {
      findUnique: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };

  const authorization = {
    assertCanAdministerDepartment: jest.fn(),
    assertCanAdministerDepartments: jest.fn(),
  };

  const service = new SchedulesService(
    prisma as never,
    authorization as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.shift.findMany.mockResolvedValue([]);
    transaction.shift.deleteMany.mockResolvedValue({ count: 0 });
    transaction.shift.upsert.mockResolvedValue({});
    transaction.schedule.update.mockResolvedValue({
      id: 'schedule-1',
      updatedAt: new Date('2026-09-01T12:00:00.000Z'),
    });
  });

  it('checks department scope before returning department schedule', async () => {
    prisma.department.findFirst.mockResolvedValue({
      id: 'department-a',
      name: 'Department A',
      kind: 'GENERAL',
      employees: [],
    });
    prisma.schedule.findUnique.mockResolvedValue(null);

    const currentUser = user();
    const result = await service.getDepartmentSchedule(
      currentUser,
      'department-a',
      2026,
      9,
    );

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenCalledWith(currentUser, 'department-a');
    expect(result.shifts).toEqual([]);
  });


  it('serializes Employee updatedAt in planner reads', async () => {
    prisma.department.findFirst.mockResolvedValue({
      id: 'department-a',
      name: 'Department A',
      kind: 'GENERAL',
      employees: [
        {
          id: 'employee-1',
          displayName: 'Employee',
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
          position: 0,
          updatedAt: new Date('2026-09-19T09:00:00.000Z'),
        },
      ],
    });
    prisma.schedule.findUnique.mockResolvedValue(null);

    const result = await service.getDepartmentSchedule(
      user(),
      'department-a',
      2026,
      9,
    );

    expect(result.employees).toEqual([
      expect.objectContaining({
        id: 'employee-1',
        updatedAt: '2026-09-19T09:00:00.000Z',
      }),
    ]);
  });

  it('applies a multi-department management batch in one transaction after scope checks', async () => {
    transaction.employee.findMany.mockResolvedValue([
      { id: 'employee-a', departmentId: 'department-a' },
      { id: 'employee-b', departmentId: 'department-b' },
    ]);
    transaction.schedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    const currentUser = user();
    const result = await service.applyManageableScheduleChanges(
      currentUser,
      2026,
      9,
      [
        {
          employeeId: 'employee-a',
          day: 7,
          type: 'off',
          expectedUpdatedAt: null,
        },
        {
          employeeId: 'employee-b',
          day: 8,
          type: 'shift',
          startTime: '08:00',
          endTime: '17:00',
          expectedUpdatedAt: null,
        },
      ],
    );

    expect(
      authorization.assertCanAdministerDepartments,
    ).toHaveBeenCalledWith(
      currentUser,
      ['department-a', 'department-b'],
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.shift.upsert).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: 'ok', applied: 2 });
  });

  it('rejects a management batch when any Employee is unavailable', async () => {
    transaction.employee.findMany.mockResolvedValue([
      { id: 'employee-a', departmentId: 'department-a' },
    ]);

    await expect(
      service.applyManageableScheduleChanges(
        user(),
        2026,
        9,
        [
          {
            employeeId: 'employee-a',
            day: 7,
            type: 'off',
            expectedUpdatedAt: null,
          },
          {
            employeeId: 'employee-missing',
            day: 8,
            type: 'off',
            expectedUpdatedAt: null,
          },
        ],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      authorization.assertCanAdministerDepartments,
    ).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.shift.upsert).not.toHaveBeenCalled();
  });

  it('writes a shift only for an active employee in the administered department', async () => {
    transaction.employee.findMany.mockResolvedValue([{ id: 'employee-1' }]);
    transaction.schedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    const currentUser = user();
    const result = await service.applyDepartmentScheduleChanges(
      currentUser,
      'department-a',
      2026,
      9,
      [
        {
          employeeId: 'employee-1',
          day: 7,
          type: 'shift',
          startTime: '08:00',
          endTime: '17:00',
        },
      ],
    );

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenCalledWith(currentUser, 'department-a');
    expect(transaction.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['employee-1'] },
          departmentId: 'department-a',
          isActive: true,
        },
      }),
    );
    expect(transaction.shift.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          scheduleId: 'schedule-1',
          employeeId: 'employee-1',
          startTime: '08:00',
          endTime: '17:00',
          isOff: false,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        applied: 1,
      }),
    );
  });

  it('rejects a zero-duration shift before accessing schedule storage', async () => {
    await expect(
      service.applyDepartmentScheduleChanges(
        user(),
        'department-a',
        2026,
        9,
        [
          {
            employeeId: 'employee-1',
            day: 7,
            type: 'shift',
            startTime: '08:00',
            endTime: '08:00',
          },
        ],
      ),
    ).rejects.toEqual(
      new BadRequestException(
        'shift startTime and endTime must be different',
      ),
    );

    expect(transaction.employee.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['20:00', '08:00'],
    ['23:00', '05:00'],
  ])(
    'accepts an overnight shift from %s to %s',
    async (startTime, endTime) => {
      transaction.employee.findMany.mockResolvedValue([{ id: 'employee-1' }]);
      transaction.schedule.findUnique.mockResolvedValue({
        id: 'schedule-1',
        updatedAt: new Date('2026-09-01T10:00:00.000Z'),
      });

      await service.applyDepartmentScheduleChanges(
        user(),
        'department-a',
        2026,
        9,
        [
          {
            employeeId: 'employee-1',
            day: 7,
            type: 'shift',
            startTime,
            endTime,
          },
        ],
      );

      expect(transaction.shift.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ startTime, endTime }),
        }),
      );
    },
  );

  it('rejects schedule writes for an employee outside the department', async () => {
    transaction.employee.findMany.mockResolvedValue([]);

    await expect(
      service.applyDepartmentScheduleChanges(
        user(),
        'department-a',
        2026,
        9,
        [
          {
            employeeId: 'employee-other',
            day: 7,
            type: 'off',
          },
        ],
      ),
    ).rejects.toThrow(
      'one or more employees do not belong to this department',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.shift.upsert).not.toHaveBeenCalled();
  });

  it('rejects stale optimistic writes', async () => {
    transaction.employee.findMany.mockResolvedValue([{ id: 'employee-1' }]);
    transaction.schedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    });
    transaction.shift.findMany.mockResolvedValue([
      {
        id: 'shift-1',
        employeeId: 'employee-1',
        date: new Date('2026-09-07T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T11:00:00.000Z'),
      },
    ]);

    await expect(
      service.applyDepartmentScheduleChanges(
        user(),
        'department-a',
        2026,
        9,
        [
          {
            employeeId: 'employee-1',
            day: 7,
            type: 'shift',
            startTime: '15:00',
            endTime: '23:00',
            expectedUpdatedAt: '2026-09-01T10:30:00.000Z',
          },
        ],
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.shift.upsert).not.toHaveBeenCalled();
  });

  it('deletes a stored cell when change type is empty', async () => {
    transaction.employee.findMany.mockResolvedValue([{ id: 'employee-1' }]);
    transaction.schedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    await service.applyDepartmentScheduleChanges(
      user(),
      'department-a',
      2026,
      9,
      [
        {
          employeeId: 'employee-1',
          day: 7,
          type: 'empty',
        },
      ],
    );

    expect(transaction.shift.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduleId: 'schedule-1',
          employeeId: 'employee-1',
        }),
      }),
    );
  });

  it('returns only the linked employee schedule for personal view', async () => {
    prisma.employee.findFirst.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Employee',
      employmentRate: 1,
      department: {
        id: 'department-a',
        name: 'Department A',
        kind: 'GENERAL',
      },
    });
    prisma.schedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    });
    prisma.shift.findMany.mockResolvedValue([
      {
        id: 'shift-1',
        employeeId: 'employee-1',
        date: new Date('2026-09-07T00:00:00.000Z'),
        code: null,
        startTime: '08:00',
        endTime: '17:00',
        isOff: false,
        updatedAt: new Date('2026-09-01T11:00:00.000Z'),
      },
    ]);

    const result = await service.getMySchedule(user(), 2026, 9);

    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'employee-1',
          userId: 'user-1',
          isActive: true,
        },
      }),
    );
    expect(prisma.shift.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scheduleId: 'schedule-1',
          employeeId: 'employee-1',
        },
      }),
    );
    expect(result.shifts[0]).toEqual(
      expect.objectContaining({
        id: 'shift-1',
        date: '2026-09-07',
      }),
    );
  });

  it('rejects personal schedule access when User is not linked to Employee', async () => {
    await expect(
      service.getMySchedule(user({ employee: null }), 2026, 9),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
  });

  it('rejects invalid month values', async () => {
    await expect(
      service.getMySchedule(user(), 2026, 13),
    ).rejects.toThrow('month must be an integer between 1 and 12');
  });
});
