import { ConflictException } from '@nestjs/common';
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
  const prisma = {
    department: {
      findFirst: jest.fn(),
    },
    employee: {
      findFirst: jest.fn(),
    },
    schedule: {
      findUnique: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
    },
  };

  const authorization = {
    assertCanAdministerDepartment: jest.fn(),
  };

  const service = new SchedulesService(
    prisma as never,
    authorization as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
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
