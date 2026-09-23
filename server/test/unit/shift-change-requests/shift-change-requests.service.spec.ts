import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  RoleType,
  ShiftChangeRequestEventType,
  ShiftChangeRequestKind,
  ShiftChangeRequestStatus,
} from '@prisma/client';

import { AuthUserContext } from '../../../src/auth/auth.service';
import { AuthorizationService } from '../../../src/auth/authorization.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShiftChangeRequestsService } from '../../../src/shift-change-requests/shift-change-requests.service';

const snapshotTime = new Date('2026-09-19T08:00:00.000Z');

function employeeUser(
  id: string,
  employeeId: string,
  departmentId: string,
): AuthUserContext {
  return {
    id,
    phoneE164: '+79991234567',
    employee: {
      id: employeeId,
      displayName: employeeId,
      departmentId,
      departmentName: 'Department A',
      employmentRate: 1,
    },
    memberships: [
      {
        id: `membership-${id}`,
        role: RoleType.EMPLOYEE,
        departmentId,
      },
    ],
  };
}

function adminUser(
  role: RoleType,
  departmentIds: Array<string | null>,
): AuthUserContext {
  return {
    id: `admin-${role}`,
    phoneE164: '+79990000000',
    employee: null,
    memberships: departmentIds.map((departmentId, index) => ({
      id: `admin-membership-${index}`,
      role,
      departmentId,
    })),
  };
}

function requestRecord(
  status: ShiftChangeRequestStatus,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'request-1',
    kind: ShiftChangeRequestKind.SWAP,
    status,
    requesterUserId: 'requester-user',
    requesterEmployeeId: 'requester-employee',
    requesterDepartmentId: 'department-a',
    targetUserId: 'target-user',
    targetEmployeeId: 'target-employee',
    targetDepartmentId: 'department-a',
    requesterShiftId: 'requester-shift',
    targetShiftId: 'target-shift',
    requesterShiftUpdatedAt: snapshotTime,
    targetShiftUpdatedAt: snapshotTime,
    managerUserId: null,
    resolvedAt: null,
    createdAt: snapshotTime,
    updatedAt: snapshotTime,
    requesterShift: { updatedAt: snapshotTime },
    targetShift: { updatedAt: snapshotTime },
    ...overrides,
  };
}

function prismaMock() {
  const mock = {
    employee: {
      findFirst: jest.fn(),
    },
    shift: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    shiftChangeRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    shiftChangeRequestEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  mock.$transaction.mockImplementation(
    async (callback: (tx: typeof mock) => unknown) => callback(mock),
  );

  return mock;
}

describe('ShiftChangeRequestsService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: ShiftChangeRequestsService;
  const requester = employeeUser(
    'requester-user',
    'requester-employee',
    'department-a',
  );
  const target = employeeUser(
    'target-user',
    'target-employee',
    'department-a',
  );

  beforeEach(() => {
    prisma = prismaMock();
    service = new ShiftChangeRequestsService(
      prisma as unknown as PrismaService,
      new AuthorizationService(),
    );
  });

  function mockValidCreate() {
    prisma.employee.findFirst
      .mockResolvedValueOnce({
        id: 'requester-employee',
        departmentId: 'department-a',
      })
      .mockResolvedValueOnce({
        id: 'target-employee',
        userId: 'target-user',
        departmentId: 'department-a',
        user: { isActive: true },
      });
    prisma.shift.findFirst
      .mockResolvedValueOnce({
        id: 'requester-shift',
        updatedAt: snapshotTime,
      })
      .mockResolvedValueOnce({
        id: 'target-shift',
        updatedAt: snapshotTime,
      });
    prisma.shiftChangeRequest.create.mockResolvedValue({ id: 'request-1' });
  }

  function mockTransition(record: ReturnType<typeof requestRecord>) {
    prisma.shiftChangeRequest.findUnique
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        id: record.id,
        status: record.status,
      });
    prisma.shiftChangeRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftChangeRequestEvent.create.mockResolvedValue({ id: 'event-1' });
  }

  it('rejects creation when User has no linked Employee', async () => {
    await expect(
      service.create(
        { ...requester, employee: null },
        {
          kind: ShiftChangeRequestKind.COVER,
          targetEmployeeId: 'target-employee',
          requesterShiftId: 'requester-shift',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow the requester to target themselves', async () => {
    await expect(
      service.create(requester, {
        kind: ShiftChangeRequestKind.COVER,
        targetEmployeeId: 'requester-employee',
        requesterShiftId: 'requester-shift',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows the requester to use only their own Shift', async () => {
    mockValidCreate();
    prisma.shift.findFirst.mockReset();
    prisma.shift.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.create(requester, {
        kind: ShiftChangeRequestKind.COVER,
        targetEmployeeId: 'target-employee',
        requesterShiftId: 'someone-elses-shift',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires a target Shift for SWAP', async () => {
    await expect(
      service.create(requester, {
        kind: ShiftChangeRequestKind.SWAP,
        targetEmployeeId: 'target-employee',
        requesterShiftId: 'requester-shift',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires the SWAP target Shift to belong to the target Employee', async () => {
    mockValidCreate();
    prisma.shift.findFirst.mockReset();
    prisma.shift.findFirst
      .mockResolvedValueOnce({
        id: 'requester-shift',
        updatedAt: snapshotTime,
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.create(requester, {
        kind: ShiftChangeRequestKind.SWAP,
        targetEmployeeId: 'target-employee',
        requesterShiftId: 'requester-shift',
        targetShiftId: 'foreign-shift',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates PENDING_TARGET request and CREATED audit event', async () => {
    mockValidCreate();

    await service.create(requester, {
      kind: ShiftChangeRequestKind.SWAP,
      targetEmployeeId: 'target-employee',
      requesterShiftId: 'requester-shift',
      targetShiftId: 'target-shift',
    });

    expect(prisma.shiftChangeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requesterUserId: 'requester-user',
          requesterEmployeeId: 'requester-employee',
          targetUserId: 'target-user',
          targetEmployeeId: 'target-employee',
          status: ShiftChangeRequestStatus.PENDING_TARGET,
          events: {
            create: {
              eventType: ShiftChangeRequestEventType.CREATED,
              actorUserId: 'requester-user',
            },
          },
        }),
      }),
    );
  });

  it('lets the target accept and creates TARGET_ACCEPTED without changing Shift', async () => {
    mockTransition(requestRecord(ShiftChangeRequestStatus.PENDING_TARGET));

    await service.accept(target, 'request-1');

    expect(prisma.shiftChangeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ShiftChangeRequestStatus.PENDING_MANAGER,
        }),
      }),
    );
    expect(prisma.shiftChangeRequestEvent.create).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        eventType: ShiftChangeRequestEventType.TARGET_ACCEPTED,
        actorUserId: 'target-user',
      },
    });
    expect(prisma.shift.update).not.toHaveBeenCalled();
  });

  it('does not let another User accept the request', async () => {
    prisma.shiftChangeRequest.findUnique.mockResolvedValue(
      requestRecord(ShiftChangeRequestStatus.PENDING_TARGET),
    );
    const stranger = employeeUser(
      'stranger-user',
      'stranger-employee',
      'department-a',
    );

    await expect(service.accept(stranger, 'request-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.shiftChangeRequest.updateMany).not.toHaveBeenCalled();
  });

  it('lets the target reject and creates TARGET_REJECTED', async () => {
    mockTransition(requestRecord(ShiftChangeRequestStatus.PENDING_TARGET));

    await service.reject(target, 'request-1');

    expect(prisma.shiftChangeRequestEvent.create).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        eventType: ShiftChangeRequestEventType.TARGET_REJECTED,
        actorUserId: 'target-user',
      },
    });
  });

  it('lets the requester cancel a pending request and creates CANCELED', async () => {
    mockTransition(requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER));

    await service.cancel(requester, 'request-1');

    expect(prisma.shiftChangeRequestEvent.create).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        eventType: ShiftChangeRequestEventType.CANCELED,
        actorUserId: 'requester-user',
      },
    });
  });

  it('allows manager approval only after target acceptance', async () => {
    prisma.shiftChangeRequest.findUnique.mockResolvedValue(
      requestRecord(ShiftChangeRequestStatus.PENDING_TARGET),
    );
    const admin = adminUser(RoleType.DEPARTMENT_ADMIN, ['department-a']);

    await expect(service.approve(admin, 'request-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it.each([RoleType.EMPLOYEE, RoleType.DEPUTY])(
    'does not grant manager approval to %s',
    async (role) => {
      prisma.shiftChangeRequest.findUnique.mockResolvedValue(
        requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER),
      );

      await expect(
        service.approve(adminUser(role, ['department-a']), 'request-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('limits Department Admin approval to their scope', async () => {
    prisma.shiftChangeRequest.findUnique.mockResolvedValue(
      requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER, {
        targetDepartmentId: 'department-b',
      }),
    );

    await expect(
      service.approve(
        adminUser(RoleType.DEPARTMENT_ADMIN, ['department-a']),
        'request-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires Department Admin rights for both departments', async () => {
    mockTransition(
      requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER, {
        targetDepartmentId: 'department-b',
      }),
    );

    await service.approve(
      adminUser(RoleType.DEPARTMENT_ADMIN, [
        'department-a',
        'department-b',
      ]),
      'request-1',
    );

    expect(prisma.shiftChangeRequestEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: ShiftChangeRequestEventType.MANAGER_APPROVED,
        }),
      }),
    );
  });

  it('allows Super Admin to approve cross-department requests', async () => {
    mockTransition(
      requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER, {
        targetDepartmentId: 'department-b',
      }),
    );
    const superAdmin = adminUser(RoleType.SUPER_ADMIN, [null]);

    await service.approve(superAdmin, 'request-1');

    expect(prisma.shiftChangeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ShiftChangeRequestStatus.MANAGER_APPROVED,
          managerUserId: superAdmin.id,
        }),
      }),
    );
    expect(prisma.shift.update).not.toHaveBeenCalled();
  });

  it('marks a request STALE when a source Shift changed', async () => {
    prisma.shiftChangeRequest.findUnique.mockResolvedValueOnce(
      requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER, {
        requesterShift: {
          updatedAt: new Date('2026-09-19T09:00:00.000Z'),
        },
      }),
    );
    prisma.shiftChangeRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftChangeRequestEvent.create.mockResolvedValue({ id: 'event-1' });

    await expect(
      service.approve(
        adminUser(RoleType.DEPARTMENT_ADMIN, ['department-a']),
        'request-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.shiftChangeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ShiftChangeRequestStatus.STALE,
        }),
      }),
    );
    expect(prisma.shiftChangeRequestEvent.create).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        eventType: ShiftChangeRequestEventType.MARKED_STALE,
        actorUserId: 'admin-DEPARTMENT_ADMIN',
      },
    });
  });

  it('does not process an already completed request again', async () => {
    prisma.shiftChangeRequest.findUnique.mockResolvedValue(
      requestRecord(ShiftChangeRequestStatus.MANAGER_APPROVED),
    );

    await expect(service.accept(target, 'request-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.shiftChangeRequestEvent.create).not.toHaveBeenCalled();
  });

  it('creates MANAGER_REJECTED audit event', async () => {
    mockTransition(requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER));
    const admin = adminUser(RoleType.DEPARTMENT_ADMIN, ['department-a']);

    await service.managerReject(admin, 'request-1');

    expect(prisma.shiftChangeRequestEvent.create).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        eventType: ShiftChangeRequestEventType.MANAGER_REJECTED,
        actorUserId: admin.id,
      },
    });
  });
});
