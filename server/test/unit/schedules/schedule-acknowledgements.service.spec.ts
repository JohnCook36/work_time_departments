import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PermissionCapability, RoleType } from '@prisma/client';

import type { AuthUserContext } from '../../../src/auth/auth.service';
import { ScheduleAcknowledgementsService } from '../../../src/schedules/schedule-acknowledgements.service';

function employeeUser(): AuthUserContext {
  return {
    id: 'user-employee',
    phoneE164: '+79990000001',
    employee: {
      id: 'employee-1',
      displayName: 'Employee 1',
      departmentId: 'department-a',
      departmentName: 'Front Office',
      employmentRate: 1,
    },
    memberships: [
      {
        id: 'membership-employee',
        role: RoleType.EMPLOYEE,
        departmentId: 'department-a',
      },
    ],
  };
}

function managerUser(): AuthUserContext {
  return {
    id: 'user-manager',
    phoneE164: '+79990000002',
    employee: null,
    memberships: [
      {
        id: 'membership-manager',
        role: RoleType.DEPARTMENT_ADMIN,
        departmentId: 'department-a',
      },
    ],
  };
}

function createPrismaMock() {
  return {
    employee: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    schedulePublication: {
      findUnique: jest.fn(),
    },
    scheduleAcknowledgement: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;
}

const snapshot = {
  department: { id: 'department-a', name: 'Front Office', kind: 'FO' },
  employees: [
    {
      id: 'employee-1',
      displayName: 'Employee 1',
      employmentRate: 1,
      scheduleMode: 'FLEXIBLE',
      fixedStartTime: null,
      fixedEndTime: null,
    },
    {
      id: 'employee-2',
      displayName: 'Employee 2',
      employmentRate: 1,
      scheduleMode: 'FLEXIBLE',
      fixedStartTime: null,
      fixedEndTime: null,
    },
  ],
  shifts: [],
};

describe('ScheduleAcknowledgementsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let authorization: { assertCapability: jest.Mock };
  let service: ScheduleAcknowledgementsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    authorization = { assertCapability: jest.fn() };
    service = new ScheduleAcknowledgementsService(
      prisma,
      authorization as any,
    );

    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1' });
    prisma.schedulePublication.findUnique.mockResolvedValue({
      id: 'publication-1',
      departmentId: 'department-a',
      version: 3,
      snapshot,
    });
  });

  it('acknowledges only a publication containing the linked employee', async () => {
    prisma.scheduleAcknowledgement.upsert.mockResolvedValue({
      id: 'ack-1',
      publicationId: 'publication-1',
      employeeId: 'employee-1',
      acknowledgedAt: new Date('2026-09-25T14:00:00.000Z'),
    });

    const result = await service.acknowledge(
      employeeUser(),
      'publication-1',
    );

    expect(prisma.scheduleAcknowledgement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publicationId_employeeId: {
            publicationId: 'publication-1',
            employeeId: 'employee-1',
          },
        },
        create: expect.objectContaining({
          acknowledgedByUserId: 'user-employee',
        }),
        update: {},
      }),
    );
    expect(result.acknowledgedAt).toBe('2026-09-25T14:00:00.000Z');
  });

  it('is idempotent through the publication/employee unique key', async () => {
    prisma.scheduleAcknowledgement.upsert.mockResolvedValue({
      id: 'ack-1',
      publicationId: 'publication-1',
      employeeId: 'employee-1',
      acknowledgedAt: new Date('2026-09-25T14:00:00.000Z'),
    });

    const first = await service.acknowledge(employeeUser(), 'publication-1');
    const second = await service.acknowledge(employeeUser(), 'publication-1');

    expect(first).toEqual(second);
    expect(prisma.scheduleAcknowledgement.upsert).toHaveBeenCalledTimes(2);
    expect(
      prisma.scheduleAcknowledgement.upsert.mock.calls[1][0].update,
    ).toEqual({});
  });

  it('rejects an unlinked or inactive employee', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.acknowledge(employeeUser(), 'publication-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.scheduleAcknowledgement.upsert).not.toHaveBeenCalled();
  });

  it('rejects acknowledgement for a publication outside employee snapshot', async () => {
    prisma.schedulePublication.findUnique.mockResolvedValue({
      id: 'publication-2',
      departmentId: 'department-b',
      version: 1,
      snapshot: {
        ...snapshot,
        department: { id: 'department-b', name: 'Other', kind: 'GENERAL' },
        employees: [snapshot.employees[1]],
      },
    });

    await expect(
      service.acknowledge(employeeUser(), 'publication-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.scheduleAcknowledgement.upsert).not.toHaveBeenCalled();
  });

  it('reads own acknowledgement independently of notification read state', async () => {
    prisma.scheduleAcknowledgement.findUnique.mockResolvedValue({
      acknowledgedAt: new Date('2026-09-25T14:00:00.000Z'),
    });

    await expect(
      service.getOwnStatus(employeeUser(), 'publication-1'),
    ).resolves.toEqual({
      publicationId: 'publication-1',
      employeeId: 'employee-1',
      status: 'ACKNOWLEDGED',
      acknowledgedAt: '2026-09-25T14:00:00.000Z',
    });
  });

  it('returns ACKNOWLEDGED / NOT_ACKNOWLEDGED / NO_ACTIVE_ACCOUNT without user ids', async () => {
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'employee-1',
        isActive: true,
        userId: 'user-employee',
        user: { isActive: true },
      },
      {
        id: 'employee-2',
        isActive: true,
        userId: null,
        user: null,
      },
    ]);
    prisma.scheduleAcknowledgement.findMany.mockResolvedValue([
      {
        employeeId: 'employee-1',
        acknowledgedAt: new Date('2026-09-25T14:00:00.000Z'),
      },
    ]);

    const result = await service.listPublicationStatuses(
      managerUser(),
      'publication-1',
    );

    expect(authorization.assertCapability).toHaveBeenCalledWith(
      expect.anything(),
      PermissionCapability.SCHEDULE_READ,
      'department-a',
    );
    expect(result.employees).toEqual([
      {
        employeeId: 'employee-1',
        displayName: 'Employee 1',
        status: 'ACKNOWLEDGED',
        acknowledgedAt: '2026-09-25T14:00:00.000Z',
      },
      {
        employeeId: 'employee-2',
        displayName: 'Employee 2',
        status: 'NO_ACTIVE_ACCOUNT',
        acknowledgedAt: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('user-employee');
  });

  it('fails closed if publication snapshot is invalid', async () => {
    prisma.schedulePublication.findUnique.mockResolvedValue({
      id: 'publication-1',
      departmentId: 'department-a',
      version: 1,
      snapshot: { broken: true },
    });

    await expect(
      service.getOwnStatus(employeeUser(), 'publication-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
