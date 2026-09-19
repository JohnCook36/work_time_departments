import { BadRequestException } from '@nestjs/common';
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
      update: jest.fn(),
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
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Employee',
      employmentRate: 1,
      scheduleMode: EmployeeScheduleMode.FLEXIBLE,
      fixedStartTime: null,
      fixedEndTime: null,
      departmentId: 'department-a',
      isActive: true,
    });
    prisma.department.findFirst.mockResolvedValue({ id: 'department-b' });
    prisma.employee.findFirst.mockResolvedValue({ position: 4 });
    prisma.employee.update.mockResolvedValue({
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

    await service.updateEmployee(admin(), 'employee-1', {
      departmentId: 'department-b',
    });

    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenNthCalledWith(1, expect.anything(), 'department-a');
    expect(
      authorization.assertCanAdministerDepartment,
    ).toHaveBeenNthCalledWith(2, expect.anything(), 'department-b');
    expect(prisma.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          departmentId: 'department-b',
          position: 5,
        }),
      }),
    );
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
