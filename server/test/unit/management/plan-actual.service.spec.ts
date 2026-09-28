import { ForbiddenException } from '@nestjs/common';
import { PermissionCapability, RoleType } from '@prisma/client';

import type { AuthUserContext } from '../../../src/auth/auth.service';
import { PlanActualService } from '../../../src/management/plan-actual.service';

describe('PlanActualService', () => {
  const user: AuthUserContext = {
    id: 'manager-1',
    phoneE164: '+79990000001',
    employee: null,
    memberships: [{
      id: 'membership-1',
      role: RoleType.DEPUTY,
      departmentId: 'department-a',
      permissions: [
        PermissionCapability.SCHEDULE_READ,
        PermissionCapability.ATTENDANCE_READ,
      ],
    }],
  };

  const prisma = {
    user: { findUnique: jest.fn() },
    department: { findMany: jest.fn() },
    schedule: { findUnique: jest.fn() },
    schedulePublication: { findMany: jest.fn() },
    workSession: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const authorization = {
    isSuperAdmin: jest.fn(),
    departmentIdsForCapability: jest.fn(),
  };

  const service = new PlanActualService(prisma as never, authorization as never);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BUSINESS_TIME_ZONE = 'Europe/Moscow';
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    prisma.user.findUnique.mockResolvedValue({
      isActive: true,
      memberships: [{
        id: 'membership-1',
        role: RoleType.DEPUTY,
        departmentId: 'department-a',
        permissions: [
          { capability: PermissionCapability.SCHEDULE_READ },
          { capability: PermissionCapability.ATTENDANCE_READ },
        ],
      }],
    });
    authorization.isSuperAdmin.mockReturnValue(false);
    authorization.departmentIdsForCapability.mockImplementation(
      (_current: unknown, capability: PermissionCapability) =>
        capability === PermissionCapability.SCHEDULE_READ ||
        capability === PermissionCapability.ATTENDANCE_READ
          ? ['department-a']
          : [],
    );
    prisma.department.findMany.mockResolvedValue([
      { id: 'department-a', name: 'Front Office', kind: 'FO' },
    ]);
    prisma.schedule.findUnique.mockResolvedValue({ id: 'schedule-1' });
    prisma.schedulePublication.findMany.mockResolvedValue([{
      id: 'publication-1',
      departmentId: 'department-a',
      version: 3,
      createdAt: new Date('2026-09-20T10:00:00.000Z'),
      snapshot: {
        department: { id: 'department-a', name: 'Front Office', kind: 'FO' },
        employees: [{
          id: 'employee-1',
          displayName: 'Employee 1',
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
        }],
        shifts: [{
          id: 'shift-published',
          employeeId: 'employee-1',
          date: '2026-09-28',
          code: null,
          startTime: '08:00',
          endTime: '17:00',
          isOff: false,
          updatedAt: '2026-09-20T09:00:00.000Z',
        }],
      },
    }]);
    prisma.workSession.findMany.mockResolvedValue([{
      id: 'session-1',
      employeeId: 'employee-1',
      departmentId: 'department-a',
      checkInAt: new Date('2026-09-28T05:15:00.000Z'),
      checkOutAt: new Date('2026-09-28T13:30:00.000Z'),
      employee: { displayName: 'Employee 1' },
    }]);
  });

  it('compares actual time against the immutable publication snapshot', async () => {
    const result = await service.read(user, 2026, 9, 'department-a');

    expect(result.businessTimeZone).toBe('Europe/Moscow');
    expect(result.payableAvailable).toBe(false);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      publicationId: 'publication-1',
      publicationVersion: 3,
      shiftId: 'shift-published',
      workSessionId: 'session-1',
      plannedMinutes: 540,
      plannedDayMinutes: 540,
      plannedNightMinutes: 0,
      actualMinutes: 495,
      actualDayMinutes: 495,
      actualNightMinutes: 0,
      latenessMinutes: 15,
      earlyLeaveMinutes: 30,
      undertimeMinutes: 45,
      payableAvailable: false,
    });
    expect(result.unplannedSessions).toEqual([]);
  });

  it('requires both schedule and attendance read capability', async () => {
    authorization.departmentIdsForCapability.mockImplementation(
      (_current: unknown, capability: PermissionCapability) =>
        capability === PermissionCapability.SCHEDULE_READ ? ['department-a'] : [],
    );

    await expect(service.read(user, 2026, 9, 'department-a'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.schedule.findUnique).not.toHaveBeenCalled();
  });
});
