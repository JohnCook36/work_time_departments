import { ForbiddenException } from '@nestjs/common';
import { RoleType } from '@prisma/client';

import { AuthUserContext } from '../../../src/auth/auth.service';
import { ManagementInsightsService } from '../../../src/management/management-insights.service';

function admin(): AuthUserContext {
  return {
    id: 'user-admin',
    phoneE164: '+79990000000',
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
}

describe('ManagementInsightsService', () => {
  const prisma = {
    department: { findMany: jest.fn() },
    schedule: { findUnique: jest.fn() },
    schedulePublication: { findMany: jest.fn() },
    absence: { findMany: jest.fn() },
    shiftChangeRequest: { findMany: jest.fn() },
    employee: { findMany: jest.fn() },
    shift: { findMany: jest.fn() },
    departmentHoursNorm: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const authorization = {
    hasAnyManagementCapability: jest.fn(),
    isSuperAdmin: jest.fn(),
    departmentIdsForCapability: jest.fn(),
    assertCapability: jest.fn(),
  };

  const service = new ManagementInsightsService(
    prisma as never,
    authorization as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    authorization.hasAnyManagementCapability.mockReturnValue(true);
    authorization.isSuperAdmin.mockReturnValue(false);
    authorization.departmentIdsForCapability.mockReturnValue(['department-a']);
    prisma.department.findMany.mockResolvedValue([
      { id: 'department-a', name: 'Front Office', kind: 'FO' },
    ]);
    prisma.schedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      updatedAt: new Date('2026-09-15T10:00:00.000Z'),
    });
    prisma.schedulePublication.findMany.mockResolvedValue([]);
    prisma.absence.findMany.mockResolvedValue([]);
    prisma.shiftChangeRequest.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.departmentHoursNorm.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('rejects users without management access before reading department data', async () => {
    authorization.hasAnyManagementCapability.mockReturnValue(false);

    await expect(
      service.hours(admin(), 2026, 9),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.department.findMany).not.toHaveBeenCalled();
  });

  it('returns scoped planned-hours analytics from the canonical hours engine', async () => {
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'employee-1',
        displayName: 'Employee 1',
        employmentRate: 1,
        departmentId: 'department-a',
      },
    ]);
    prisma.shift.findMany.mockResolvedValue([
      {
        id: 'shift-1',
        employeeId: 'employee-1',
        startTime: '20:00',
        endTime: '08:00',
        code: 'N',
      },
    ]);

    const result = await service.hours(admin(), 2026, 9, 'department-a');

    expect(result.employees).toEqual([
      expect.objectContaining({
        id: 'employee-1',
        dayHours: 4,
        nightHours: 8,
        plannedHours: 12,
        productionNormHours: 176,
        comparisonNormHours: 176,
        deltaHours: -164,
        status: 'under',
      }),
    ]);
    expect(result.departments).toEqual([
      expect.objectContaining({
        id: 'department-a',
        plannedHours: 12,
        productionNormHours: 176,
        departmentNormHours: null,
        comparisonNormHours: 176,
        deltaHours: -164,
        outsideNormCount: 1,
      }),
    ]);
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          departmentId: { in: ['department-a'] },
        }),
      }),
    );
  });

  it('applies configured department norm scaled by employment rate', async () => {
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'employee-1',
        displayName: 'Employee 1',
        employmentRate: 0.5,
        departmentId: 'department-a',
      },
    ]);
    prisma.departmentHoursNorm.findMany.mockResolvedValue([
      {
        departmentId: 'department-a',
        fullTimeHours: 160,
        updatedAt: new Date('2026-09-20T10:00:00.000Z'),
      },
    ]);
    prisma.shift.findMany.mockResolvedValue([]);

    const result = await service.hours(admin(), 2026, 9, 'department-a');

    expect(result.departmentNormConfigured).toBe(true);
    expect(result.employees[0]).toEqual(
      expect.objectContaining({
        productionNormHours: 88,
        departmentNormHours: 80,
        comparisonNormHours: 80,
        deltaHours: -80,
      }),
    );
    expect(result.departments[0]).toEqual(
      expect.objectContaining({
        productionNormHours: 88,
        departmentNormHours: 80,
        comparisonNormHours: 80,
      }),
    );
  });

  it('builds today from the latest published snapshot and live operational queues', async () => {
    prisma.schedulePublication.findMany.mockResolvedValue([
      {
        id: 'publication-2',
        departmentId: 'department-a',
        version: 2,
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
        snapshot: {
          department: {
            id: 'department-a',
            name: 'Front Office',
            kind: 'FO',
          },
          employees: [
            {
              id: 'employee-1',
              displayName: 'Employee 1',
              employmentRate: 1,
              scheduleMode: 'FLEXIBLE',
              fixedStartTime: null,
              fixedEndTime: null,
            },
          ],
          shifts: [
            {
              id: 'shift-1',
              employeeId: 'employee-1',
              date: '2026-09-25',
              code: null,
              startTime: '08:00',
              endTime: '17:00',
              isOff: false,
              updatedAt: '2026-09-20T09:00:00.000Z',
            },
          ],
        },
      },
    ]);
    prisma.absence.findMany.mockResolvedValue([
      {
        id: 'absence-1',
        employeeId: 'employee-2',
        type: 'SICK',
        startDate: new Date('2026-09-25T00:00:00.000Z'),
        endDate: new Date('2026-09-25T00:00:00.000Z'),
        comment: null,
        employee: {
          displayName: 'Employee 2',
          departmentId: 'department-a',
        },
      },
    ]);
    prisma.shiftChangeRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        kind: 'COVER',
        status: 'PENDING_MANAGER',
        requesterDepartmentId: 'department-a',
        targetDepartmentId: 'department-a',
        requesterEmployee: { displayName: 'Employee 1' },
        targetEmployee: { displayName: 'Employee 2' },
        requesterShift: {
          date: new Date('2026-09-25T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '17:00',
          code: null,
        },
        targetShift: null,
        createdAt: new Date('2026-09-24T18:00:00.000Z'),
      },
    ]);

    const result = await service.today(admin(), '2026-09-25');

    expect(result.attendanceAvailable).toBe(false);
    expect(result.totals).toEqual({
      plannedShifts: 1,
      activeAbsences: 1,
      pendingRequests: 1,
      unpublishedDepartments: 0,
    });
    expect(result.departments[0]).toEqual(
      expect.objectContaining({
        id: 'department-a',
        riskCount: 2,
        plannedShifts: [
          expect.objectContaining({
            displayName: 'Employee 1',
            startTime: '08:00',
            endTime: '17:00',
          }),
        ],
      }),
    );
  });
});
