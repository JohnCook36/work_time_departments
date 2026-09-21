import { BadRequestException, ConflictException } from '@nestjs/common';
import { EmployeeScheduleMode, RoleType } from '@prisma/client';

import { AuthUserContext } from '../auth/auth.service';
import { EmployeesService } from './employees.service';

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
