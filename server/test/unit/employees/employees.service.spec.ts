import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  EmployeeScheduleMode,
  RoleType,
} from '@prisma/client';

import { AuthUserContext } from '../../../src/auth/auth.service';
import { EmployeesService } from '../../../src/employees/employees.service';

function admin(): AuthUserContext {
  return {
    id: 'admin-user',
    phoneE164: '+79990000000',
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

describe('EmployeesService', () => {
  const prisma = {
    department: {
      findFirst: jest.fn(),
    },
    employee: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    onboardingRequest: {
      count: jest.fn(),
    },
    shiftChangeRequest: {
      count: jest.fn(),
    },
    user: {
      updateMany: jest.fn(),
    },
    membership: {
      updateMany: jest.fn(),
    },
    authSession: {
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const authorization = {
    assertCanAdministerDepartment: jest.fn(),
  };

  const service = new EmployeesService(
    prisma as never,
    authorization as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.department.findFirst.mockResolvedValue({ id: 'department-a' });
    prisma.employee.updateMany.mockResolvedValue({ count: 1 });
    prisma.onboardingRequest.count.mockResolvedValue(0);
    prisma.shiftChangeRequest.count.mockResolvedValue(0);
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.membership.updateMany.mockResolvedValue({ count: 1 });
    prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        employee: {
          findMany: prisma.employee.findMany,
          findUnique: prisma.employee.findUnique,
          updateMany: prisma.employee.updateMany,
        },
        onboardingRequest: {
          count: prisma.onboardingRequest.count,
        },
        shiftChangeRequest: {
          count: prisma.shiftChangeRequest.count,
        },
        user: {
          updateMany: prisma.user.updateMany,
        },
        membership: {
          updateMany: prisma.membership.updateMany,
        },
        authSession: {
          updateMany: prisma.authSession.updateMany,
        },
        auditLog: {
          create: prisma.auditLog.create,
        },
      }),
    );
  });

  it('creates a flexible employee with cleared fixed hours', async () => {
    prisma.employee.findFirst.mockResolvedValue({ position: 2 });
    prisma.employee.create.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Employee',
      employmentRate: 1,
      scheduleMode: EmployeeScheduleMode.FLEXIBLE,
      fixedStartTime: null,
      fixedEndTime: null,
      departmentId: 'department-a',
      position: 3,
      isActive: true,
      userId: null,
      updatedAt: new Date('2026-09-19T10:00:00.000Z'),
    });

    const result = await service.createEmployee(admin(), {
      displayName: 'Employee',
      departmentId: 'department-a',
      scheduleMode: EmployeeScheduleMode.FLEXIBLE,
      fixedStartTime: '08:00',
      fixedEndTime: '17:00',
    });

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenCalledWith(expect.anything(), 'department-a');
    expect(prisma.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          position: 3,
          scheduleMode: EmployeeScheduleMode.FLEXIBLE,
          fixedStartTime: null,
          fixedEndTime: null,
        }),
      }),
    );
    expect(result.isLinked).toBe(false);
  });

  it('requires both times for FIXED_WEEKDAYS', async () => {
    await expect(
      service.createEmployee(admin(), {
        displayName: 'Employee',
        departmentId: 'department-a',
        scheduleMode: EmployeeScheduleMode.FIXED_WEEKDAYS,
        fixedStartTime: '08:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.employee.create).not.toHaveBeenCalled();
  });

  it('rejects equal fixed weekday start and end times', async () => {
    await expect(
      service.createEmployee(admin(), {
        displayName: 'Employee',
        departmentId: 'department-a',
        scheduleMode: EmployeeScheduleMode.FIXED_WEEKDAYS,
        fixedStartTime: '08:00',
        fixedEndTime: '08:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.employee.create).not.toHaveBeenCalled();
  });

  it('creates a fixed weekday employee with validated hours', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    prisma.employee.create.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Employee',
      employmentRate: 0.75,
      scheduleMode: EmployeeScheduleMode.FIXED_WEEKDAYS,
      fixedStartTime: '08:00',
      fixedEndTime: '17:00',
      departmentId: 'department-a',
      position: 0,
      isActive: true,
      userId: null,
      updatedAt: new Date('2026-09-19T10:00:00.000Z'),
    });

    await service.createEmployee(admin(), {
      displayName: 'Employee',
      departmentId: 'department-a',
      employmentRate: 0.75,
      scheduleMode: EmployeeScheduleMode.FIXED_WEEKDAYS,
      fixedStartTime: '08:00',
      fixedEndTime: '17:00',
    });

    expect(prisma.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employmentRate: 0.75,
          scheduleMode: EmployeeScheduleMode.FIXED_WEEKDAYS,
          fixedStartTime: '08:00',
          fixedEndTime: '17:00',
        }),
      }),
    );
  });

  it('requires admin scope for both departments when moving an employee', async () => {
    const expectedUpdatedAt = new Date('2026-09-19T09:00:00.000Z');
    prisma.employee.findUnique
      .mockResolvedValueOnce({
        id: 'employee-1',
        displayName: 'Employee',
        employmentRate: 1,
        scheduleMode: EmployeeScheduleMode.FLEXIBLE,
        fixedStartTime: null,
        fixedEndTime: null,
        departmentId: 'department-a',
        isActive: true,
        updatedAt: expectedUpdatedAt,
      })
      .mockResolvedValueOnce({
        id: 'employee-1',
        displayName: 'Employee',
        employmentRate: 1,
        scheduleMode: EmployeeScheduleMode.FLEXIBLE,
        fixedStartTime: null,
        fixedEndTime: null,
        departmentId: 'department-b',
        position: 5,
        isActive: true,
        userId: null,
        updatedAt: new Date('2026-09-19T10:00:00.000Z'),
      });
    prisma.department.findFirst.mockResolvedValue({ id: 'department-b' });
    prisma.employee.findFirst.mockResolvedValue({ position: 4 });

    await service.updateEmployee(admin(), 'employee-1', {
      departmentId: 'department-b',
      expectedUpdatedAt: expectedUpdatedAt.toISOString(),
    });

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenNthCalledWith(1, expect.anything(), 'department-a');
    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenNthCalledWith(2, expect.anything(), 'department-b');
    expect(prisma.employee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'employee-1',
          isActive: true,
          updatedAt: expectedUpdatedAt,
        },
        data: expect.objectContaining({
          departmentId: 'department-b',
          position: 5,
        }),
      }),
    );
  });

  it('blocks moving an employee while an active shift-change request exists', async () => {
    const expectedUpdatedAt = new Date('2026-09-19T09:00:00.000Z');
    prisma.employee.findUnique.mockResolvedValueOnce({
      id: 'employee-1',
      displayName: 'Employee',
      employmentRate: 1,
      scheduleMode: EmployeeScheduleMode.FLEXIBLE,
      fixedStartTime: null,
      fixedEndTime: null,
      departmentId: 'department-a',
      isActive: true,
      updatedAt: expectedUpdatedAt,
    });
    prisma.department.findFirst.mockResolvedValue({ id: 'department-b' });
    prisma.shiftChangeRequest.count.mockResolvedValue(1);

    await expect(
      service.updateEmployee(admin(), 'employee-1', {
        departmentId: 'department-b',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.shiftChangeRequest.count).toHaveBeenCalledWith({
      where: {
        status: {
          in: [
            'PENDING_TARGET',
            'PENDING_MANAGER',
          ],
        },
        OR: [
          { requesterEmployeeId: 'employee-1' },
          { targetEmployeeId: 'employee-1' },
        ],
      },
    });
    expect(prisma.employee.updateMany).not.toHaveBeenCalled();
  });

  it('updates an employee when expectedUpdatedAt is current', async () => {
    const expectedUpdatedAt = new Date('2026-09-19T09:00:00.000Z');
    prisma.employee.findUnique
      .mockResolvedValueOnce({
        id: 'employee-1',
        displayName: 'Employee',
        employmentRate: 1,
        scheduleMode: EmployeeScheduleMode.FLEXIBLE,
        fixedStartTime: null,
        fixedEndTime: null,
        departmentId: 'department-a',
        isActive: true,
        updatedAt: expectedUpdatedAt,
      })
      .mockResolvedValueOnce({
        id: 'employee-1',
        displayName: 'Employee',
        employmentRate: 0.75,
        scheduleMode: EmployeeScheduleMode.FLEXIBLE,
        fixedStartTime: null,
        fixedEndTime: null,
        departmentId: 'department-a',
        position: 0,
        isActive: true,
        userId: null,
        updatedAt: new Date('2026-09-19T10:00:00.000Z'),
      });

    const result = await service.updateEmployee(admin(), 'employee-1', {
      employmentRate: 0.75,
      expectedUpdatedAt: expectedUpdatedAt.toISOString(),
    });

    expect(prisma.employee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'employee-1',
          isActive: true,
          updatedAt: expectedUpdatedAt,
        },
        data: expect.objectContaining({
          employmentRate: 0.75,
        }),
      }),
    );
    expect(result.employmentRate).toBe(0.75);
    expect(result.updatedAt).toBe('2026-09-19T10:00:00.000Z');
  });

  it('edits fixed hours through the existing server Employee update', async () => {
    const version = new Date('2026-09-19T09:00:00.000Z');
    prisma.employee.findUnique
      .mockResolvedValueOnce({
        id: 'employee-1', displayName: 'Employee', employmentRate: 1,
        scheduleMode: EmployeeScheduleMode.FIXED_WEEKDAYS,
        fixedStartTime: '08:00', fixedEndTime: '17:00',
        departmentId: 'department-a', isActive: true, updatedAt: version,
      })
      .mockResolvedValueOnce({
        id: 'employee-1', displayName: 'Employee', employmentRate: 1,
        scheduleMode: EmployeeScheduleMode.FIXED_WEEKDAYS,
        fixedStartTime: '09:00', fixedEndTime: '18:00',
        departmentId: 'department-a', position: 0, isActive: true,
        userId: null, updatedAt: new Date('2026-09-19T10:00:00.000Z'),
      });

    const result = await service.updateEmployee(admin(), 'employee-1', {
      fixedStartTime: '09:00', fixedEndTime: '18:00',
      expectedUpdatedAt: version.toISOString(),
    });

    expect(authorization.assertCanAdministerDepartment).toHaveBeenCalledWith(expect.anything(), 'department-a');
    expect(prisma.employee.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        scheduleMode: EmployeeScheduleMode.FIXED_WEEKDAYS,
        fixedStartTime: '09:00', fixedEndTime: '18:00',
      }),
    }));
    expect(result.fixedStartTime).toBe('09:00');
    expect(result.fixedEndTime).toBe('18:00');
  });

  it('rejects a stale expectedUpdatedAt before attempting the write', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Employee',
      employmentRate: 1,
      scheduleMode: EmployeeScheduleMode.FLEXIBLE,
      fixedStartTime: null,
      fixedEndTime: null,
      departmentId: 'department-a',
      isActive: true,
      updatedAt: new Date('2026-09-19T10:00:00.000Z'),
    });

    await expect(
      service.updateEmployee(admin(), 'employee-1', {
        employmentRate: 0.75,
        expectedUpdatedAt: '2026-09-19T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.employee.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a malformed expectedUpdatedAt', async () => {
    await expect(
      service.updateEmployee(admin(), 'employee-1', {
        employmentRate: 0.75,
        expectedUpdatedAt: 'not-a-date',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.employee.findUnique).not.toHaveBeenCalled();
  });

  it('requires expectedUpdatedAt for updates', async () => {
    await expect(
      service.updateEmployee(admin(), 'employee-1', {
        employmentRate: 0.75,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.employee.findUnique).not.toHaveBeenCalled();
  });

  it('returns a conflict when the conditional write loses a race', async () => {
    const expectedUpdatedAt = new Date('2026-09-19T09:00:00.000Z');
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Employee',
      employmentRate: 1,
      scheduleMode: EmployeeScheduleMode.FLEXIBLE,
      fixedStartTime: null,
      fixedEndTime: null,
      departmentId: 'department-a',
      isActive: true,
      updatedAt: expectedUpdatedAt,
    });
    prisma.employee.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateEmployee(admin(), 'employee-1', {
        employmentRate: 0.75,
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.employee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'employee-1',
          isActive: true,
          updatedAt: expectedUpdatedAt,
        },
      }),
    );
  });

  it('does not require expectedUpdatedAt when creating an employee', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    prisma.employee.create.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Employee',
      employmentRate: 1,
      scheduleMode: EmployeeScheduleMode.FLEXIBLE,
      fixedStartTime: null,
      fixedEndTime: null,
      departmentId: 'department-a',
      position: 0,
      isActive: true,
      userId: null,
      updatedAt: new Date('2026-09-19T10:00:00.000Z'),
    });

    await expect(
      service.createEmployee(admin(), {
        displayName: 'Employee',
        departmentId: 'department-a',
      }),
    ).resolves.toMatchObject({ id: 'employee-1' });
  });

  it('atomically reorders every active employee in a department', async () => {
    const employeeAUpdatedAt = new Date('2026-09-19T09:00:00.000Z');
    const employeeBUpdatedAt = new Date('2026-09-19T09:05:00.000Z');
    prisma.employee.findMany.mockResolvedValue([
      { id: 'employee-a', updatedAt: employeeAUpdatedAt },
      { id: 'employee-b', updatedAt: employeeBUpdatedAt },
    ]);
    prisma.employee.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.reorderEmployees(admin(), {
      departmentId: 'department-a',
      orderedEmployeeIds: ['employee-b', 'employee-a'],
      expectedUpdatedAtByEmployeeId: {
        'employee-a': employeeAUpdatedAt.toISOString(),
        'employee-b': employeeBUpdatedAt.toISOString(),
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.employee.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: 'employee-b',
          departmentId: 'department-a',
          isActive: true,
          updatedAt: employeeBUpdatedAt,
        },
        data: { position: 0 },
      }),
    );
    expect(prisma.employee.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: 'employee-a',
          departmentId: 'department-a',
          isActive: true,
          updatedAt: employeeAUpdatedAt,
        },
        data: { position: 1 },
      }),
    );
    expect(result).toEqual({ status: 'ok', reordered: 2 });
  });

  it('rejects reorder when the active Employee set changed', async () => {
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'employee-a',
        updatedAt: new Date('2026-09-19T09:00:00.000Z'),
      },
    ]);

    await expect(
      service.reorderEmployees(admin(), {
        departmentId: 'department-a',
        orderedEmployeeIds: ['employee-a', 'employee-b'],
        expectedUpdatedAtByEmployeeId: {
          'employee-a': '2026-09-19T09:00:00.000Z',
          'employee-b': '2026-09-19T09:05:00.000Z',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.employee.updateMany).not.toHaveBeenCalled();
  });

  it('rejects reorder with stale Employee optimistic metadata', async () => {
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'employee-a',
        updatedAt: new Date('2026-09-19T10:00:00.000Z'),
      },
    ]);

    await expect(
      service.reorderEmployees(admin(), {
        departmentId: 'department-a',
        orderedEmployeeIds: ['employee-a'],
        expectedUpdatedAtByEmployeeId: {
          'employee-a': '2026-09-19T09:00:00.000Z',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.employee.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back reorder when a conditional position update loses a race', async () => {
    const employeeAUpdatedAt = new Date('2026-09-19T09:00:00.000Z');
    const employeeBUpdatedAt = new Date('2026-09-19T09:05:00.000Z');
    prisma.employee.findMany.mockResolvedValue([
      { id: 'employee-a', updatedAt: employeeAUpdatedAt },
      { id: 'employee-b', updatedAt: employeeBUpdatedAt },
    ]);
    prisma.employee.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.reorderEmployees(admin(), {
        departmentId: 'department-a',
        orderedEmployeeIds: ['employee-b', 'employee-a'],
        expectedUpdatedAtByEmployeeId: {
          'employee-a': employeeAUpdatedAt.toISOString(),
          'employee-b': employeeBUpdatedAt.toISOString(),
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('soft-deactivates an unlinked Employee with optimistic locking', async () => {
    const updatedAt = new Date('2026-09-22T08:00:00.000Z');
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-a',
      departmentId: 'department-a',
      isActive: true,
      userId: null,
      updatedAt,
      user: null,
    });

    const result = await service.deactivateEmployee(
      admin(),
      'employee-a',
      { expectedUpdatedAt: updatedAt.toISOString() },
    );

    expect(prisma.employee.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'employee-a',
        isActive: true,
        updatedAt,
      },
      data: {
        isActive: false,
      },
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-user',
        action: AuditAction.EMPLOYEE_DEACTIVATED,
        entityType: AuditEntityType.EMPLOYEE,
        entityId: 'employee-a',
        departmentId: 'department-a',
      },
      select: { id: true },
    });
    expect(result).toEqual({
      status: 'ok',
      employeeId: 'employee-a',
    });
  });

  it('deactivates a linked User, memberships, and sessions together with Employee', async () => {
    const updatedAt = new Date('2026-09-22T08:00:00.000Z');
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-a',
      departmentId: 'department-a',
      isActive: true,
      userId: 'employee-user',
      updatedAt,
      user: {
        memberships: [
          {
            role: RoleType.EMPLOYEE,
            departmentId: 'department-a',
          },
        ],
      },
    });

    await service.deactivateEmployee(
      admin(),
      'employee-a',
      { expectedUpdatedAt: updatedAt.toISOString() },
    );

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'employee-user',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
    expect(prisma.membership.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'employee-user',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'employee-user',
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      }),
    );
  });

  it('rejects Employee self-deactivation', async () => {
    const updatedAt = new Date('2026-09-22T08:00:00.000Z');
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-a',
      departmentId: 'department-a',
      isActive: true,
      userId: 'admin-user',
      updatedAt,
      user: {
        memberships: [
          {
            role: RoleType.DEPARTMENT_ADMIN,
            departmentId: 'department-a',
          },
        ],
      },
    });

    await expect(
      service.deactivateEmployee(
        admin(),
        'employee-a',
        { expectedUpdatedAt: updatedAt.toISOString() },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.employee.updateMany).not.toHaveBeenCalled();
  });

  it('requires Super Admin to deactivate a linked management account', async () => {
    const updatedAt = new Date('2026-09-22T08:00:00.000Z');
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-a',
      departmentId: 'department-a',
      isActive: true,
      userId: 'manager-user',
      updatedAt,
      user: {
        memberships: [
          {
            role: RoleType.DEPARTMENT_ADMIN,
            departmentId: 'department-a',
          },
        ],
      },
    });

    await expect(
      service.deactivateEmployee(
        admin(),
        'employee-a',
        { expectedUpdatedAt: updatedAt.toISOString() },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.employee.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['pending onboarding', 'onboardingRequest'],
    ['active shift-change request', 'shiftChangeRequest'],
  ] as const)(
    'blocks Employee deactivation while %s remains',
    async (_label, blocker) => {
      const updatedAt = new Date('2026-09-22T08:00:00.000Z');
      prisma.employee.findUnique.mockResolvedValue({
        id: 'employee-a',
        departmentId: 'department-a',
        isActive: true,
        userId: null,
        updatedAt,
        user: null,
      });
      prisma[blocker].count.mockResolvedValue(1);

      await expect(
        service.deactivateEmployee(
          admin(),
          'employee-a',
          { expectedUpdatedAt: updatedAt.toISOString() },
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.employee.updateMany).not.toHaveBeenCalled();
    },
  );

  it('lists only active employees in the requested department', async () => {
    prisma.employee.findMany.mockResolvedValue([]);

    await service.listDepartmentEmployees(admin(), 'department-a');

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          departmentId: 'department-a',
          isActive: true,
        },
      }),
    );
  });
});
