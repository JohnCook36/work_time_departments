import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
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
    requesterShift: {
      id: 'requester-shift', scheduleId: 'schedule-1', employeeId: 'requester-employee',
      date: new Date('2026-09-19T00:00:00.000Z'), code: null,
      startTime: '08:00', endTime: '17:00', isOff: false, updatedAt: snapshotTime,
    },
    targetShift: {
      id: 'target-shift', scheduleId: 'schedule-1', employeeId: 'target-employee',
      date: new Date('2026-09-19T00:00:00.000Z'), code: null,
      startTime: '09:00', endTime: '18:00', isOff: false, updatedAt: snapshotTime,
    },
    requesterEmployee: {
      departmentId: 'department-a',
      isActive: true,
    },
    targetEmployee: {
      departmentId: 'department-a',
      isActive: true,
    },
    ...overrides,
  };
}

function prismaMock() {
  const mock = {
    employee: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    shift: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    schedule: { update: jest.fn() },
    schedulePublication: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    shiftChangeRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    shiftChangeRequestEvent: {
      create: jest.fn(),
    },
    auditLog: {
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
    prisma.shift.updateMany.mockResolvedValue({ count: 1 });
    prisma.shift.findFirst.mockResolvedValue(null);
    prisma.schedulePublication.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockImplementation(async () => ({
      isActive: true,
      memberships: [
        { id: 'manager-a', role: RoleType.DEPARTMENT_ADMIN, departmentId: 'department-a' },
        { id: 'manager-b', role: RoleType.DEPARTMENT_ADMIN, departmentId: 'department-b' },
        { id: 'super-admin', role: RoleType.SUPER_ADMIN, departmentId: null },
      ],
    }));
    service = new ShiftChangeRequestsService(
      prisma as unknown as PrismaService,
      new AuthorizationService(),
    );
  });

  it('requires a current linked Employee for discovery', async () => {
    await expect(service.discoverTargets({ ...requester, employee: null })).rejects.toBeInstanceOf(ForbiddenException);
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(service.discoverTargets(requester)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only discovers same-department active linked employees and projects names', async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: 'requester-employee', departmentId: 'department-a' });
    prisma.employee.findMany.mockResolvedValue([{ id: 'target-employee', displayName: 'Сотрудник Б' }]);
    expect(await service.discoverTargets(requester)).toEqual([{ id: 'target-employee', displayName: 'Сотрудник Б' }]);
    expect(prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ departmentId: 'department-a', id: { not: 'requester-employee' }, isActive: true, userId: { not: null }, user: { isActive: true } }),
      select: { id: true, displayName: true },
    }));
  });

  it('reads just one target published work shift by date, without phone, rate or schedule dump', async () => {
    prisma.employee.findFirst.mockResolvedValueOnce({ id: 'requester-employee', departmentId: 'department-a' })
      .mockResolvedValueOnce({ id: 'target-employee' });
    prisma.shift.findFirst.mockResolvedValueOnce({
      id: 'requester-shift', scheduleId: 'schedule-1', employeeId: 'requester-employee',
      date: new Date('2026-09-20T00:00:00.000Z'), startTime: '07:00', endTime: '16:00',
      code: null, isOff: false, updatedAt: snapshotTime,
    });
    prisma.shift.findFirst.mockResolvedValue({
      id: 'target-shift', scheduleId: 'schedule-1', employeeId: 'target-employee',
      date: new Date('2026-09-20T00:00:00.000Z'), startTime: '08:00', endTime: '17:00',
      code: null, isOff: false, updatedAt: snapshotTime,
    });
    prisma.schedulePublication.findFirst.mockResolvedValue({
      snapshot: {
        department: { id: 'department-a', name: 'A', kind: 'GENERAL' },
        employees: [],
        shifts: [
          { id: 'requester-shift', employeeId: 'requester-employee', date: '2026-09-20', startTime: '07:00', endTime: '16:00', code: null, isOff: false, updatedAt: snapshotTime.toISOString() },
          { id: 'target-shift', employeeId: 'target-employee', date: '2026-09-20', startTime: '08:00', endTime: '17:00', code: null, isOff: false, updatedAt: snapshotTime.toISOString() },
        ],
      },
    });
    expect(await service.discoverTargetShift(requester, 'target-employee', '2026-09-20', 'requester-shift')).toEqual({
      id: 'target-shift', date: '2026-09-20', startTime: '08:00', endTime: '17:00', code: null,
    });
    expect(prisma.shift.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { employeeId: 'target-employee', date: new Date('2026-09-20T00:00:00.000Z'), isOff: false, startTime: { not: null }, endTime: { not: null } },
      select: expect.objectContaining({ id: true, scheduleId: true, employeeId: true, updatedAt: true }),
    }));
  });

  it('does not expose an unpublished target draft through discovery', async () => {
    prisma.employee.findFirst.mockResolvedValueOnce({ id: 'requester-employee', departmentId: 'department-a' })
      .mockResolvedValueOnce({ id: 'target-employee' });
    prisma.shift.findFirst.mockResolvedValueOnce({
      id: 'requester-shift', scheduleId: 'schedule-1', employeeId: 'requester-employee',
      date: new Date('2026-09-20T00:00:00.000Z'), startTime: '07:00', endTime: '16:00',
      code: null, isOff: false, updatedAt: snapshotTime,
    });
    prisma.shift.findFirst.mockResolvedValueOnce({
      id: 'target-shift', scheduleId: 'schedule-1', employeeId: 'target-employee',
      date: new Date('2026-09-20T00:00:00.000Z'), startTime: '10:00', endTime: '19:00',
      code: null, isOff: false, updatedAt: new Date('2026-09-19T09:00:00.000Z'),
    });
    prisma.schedulePublication.findFirst.mockResolvedValue({
      snapshot: {
        department: { id: 'department-a', name: 'A', kind: 'GENERAL' },
        employees: [],
        shifts: [
          { id: 'requester-shift', employeeId: 'requester-employee', date: '2026-09-20', startTime: '07:00', endTime: '16:00', code: null, isOff: false, updatedAt: snapshotTime.toISOString() },
          { id: 'target-shift', employeeId: 'target-employee', date: '2026-09-20', startTime: '08:00', endTime: '17:00', code: null, isOff: false, updatedAt: snapshotTime.toISOString() },
        ],
      },
    });

    await expect(
      service.discoverTargetShift(requester, 'target-employee', '2026-09-20', 'requester-shift'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects invalid dates and targets outside the same active linked department', async () => {
    prisma.employee.findFirst
      .mockResolvedValueOnce({ id: 'requester-employee', departmentId: 'department-a' })
      .mockResolvedValueOnce({ id: 'requester-employee', departmentId: 'department-a' })
      .mockResolvedValueOnce(null);
    await expect(service.discoverTargetShift(requester, 'target-employee', '2026-02-30', 'requester-shift')).rejects.toBeInstanceOf(BadRequestException);
    prisma.shift.findFirst.mockResolvedValueOnce({
      id: 'requester-shift', scheduleId: 'schedule-1', employeeId: 'requester-employee',
      date: new Date('2026-09-20T00:00:00.000Z'), startTime: '07:00', endTime: '16:00',
      code: null, isOff: false, updatedAt: snapshotTime,
    });
    prisma.schedulePublication.findFirst.mockResolvedValue({
      snapshot: {
        department: { id: 'department-a', name: 'A', kind: 'GENERAL' },
        employees: [],
        shifts: [
          { id: 'requester-shift', employeeId: 'requester-employee', date: '2026-09-20', startTime: '07:00', endTime: '16:00', code: null, isOff: false, updatedAt: snapshotTime.toISOString() },
        ],
      },
    });
    await expect(service.discoverTargetShift(requester, 'target-employee', '2026-09-20', 'requester-shift')).rejects.toMatchObject({ status: 404 });
    expect(prisma.employee.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ departmentId: 'department-a', id: { equals: 'target-employee', not: 'requester-employee' }, user: { isActive: true }, isActive: true }),
    }));
    expect(prisma.shift.findFirst).toHaveBeenCalledTimes(1);
  });

  it('refuses synthetic, OFF or another employee source before looking up a target shift', async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: 'requester-employee', departmentId: 'department-a' });
    await expect(service.discoverTargetShift(requester, 'target-employee', '2026-09-20', 'default:employee:2026-09-20')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.discoverTargetShift(requester, 'target-employee', '2026-09-20', 'someone-elses-shift')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.employee.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.shift.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'someone-elses-shift', employeeId: 'requester-employee', isOff: false, startTime: { not: null }, endTime: { not: null } },
      select: expect.objectContaining({ id: true, scheduleId: true, employeeId: true, updatedAt: true }),
    }));
  });

  it('does not expose account ids in shift-change response selects', async () => {
    prisma.shiftChangeRequest.findMany.mockResolvedValue([]);

    await service.getMine(requester);

    expect(prisma.shiftChangeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          requesterUserId: expect.anything(),
          targetUserId: expect.anything(),
          managerUserId: expect.anything(),
        }),
      }),
    );

    const select = prisma.shiftChangeRequest.findMany.mock.calls[0][0].select;
    expect(select.events.select).not.toHaveProperty('actorUserId');
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

  it.each([ShiftChangeRequestKind.SWAP, ShiftChangeRequestKind.COVER])('rejects display-only shift IDs for %s before database requests', async (kind) => {
    await expect(service.create(requester, {
      kind, targetEmployeeId: 'target-employee',
      requesterShiftId: 'default:requester-employee:2026-05-04',
      ...(kind === ShiftChangeRequestKind.SWAP ? { targetShiftId: 'target-shift' } : {}),
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.shift.findFirst).not.toHaveBeenCalled();
    expect(prisma.shiftChangeRequest.create).not.toHaveBeenCalled();
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

  it('rejects request creation when a persisted shift changed after publication', async () => {
    prisma.employee.findFirst
      .mockResolvedValueOnce({ id: 'requester-employee', departmentId: 'department-a' })
      .mockResolvedValueOnce({
        id: 'target-employee', userId: 'target-user', departmentId: 'department-a',
        user: { isActive: true },
      });
    prisma.shift.findFirst.mockResolvedValueOnce({
      id: 'requester-shift', scheduleId: 'schedule-1', employeeId: 'requester-employee',
      date: new Date('2026-09-20T00:00:00.000Z'), code: null, startTime: '10:00', endTime: '19:00',
      isOff: false, updatedAt: new Date('2026-09-19T09:00:00.000Z'),
    });
    prisma.schedulePublication.findFirst.mockResolvedValue({
      snapshot: {
        department: { id: 'department-a', name: 'A', kind: 'GENERAL' },
        employees: [],
        shifts: [
          { id: 'requester-shift', employeeId: 'requester-employee', date: '2026-09-20', code: null, startTime: '08:00', endTime: '17:00', isOff: false, updatedAt: snapshotTime.toISOString() },
        ],
      },
    });

    await expect(service.create(requester, {
      kind: ShiftChangeRequestKind.COVER,
      targetEmployeeId: 'target-employee',
      requesterShiftId: 'requester-shift',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.shiftChangeRequest.create).not.toHaveBeenCalled();
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
    expect(prisma.shift.updateMany).not.toHaveBeenCalled();
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

  it('hides pending manager requests when current employee scope moved away', async () => {
    prisma.shiftChangeRequest.findMany.mockResolvedValue([]);

    await service.getPendingForAdmin(
      adminUser(RoleType.DEPARTMENT_ADMIN, ['department-a']),
    );

    expect(prisma.shiftChangeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requesterDepartmentId: { in: ['department-a'] },
          targetDepartmentId: { in: ['department-a'] },
          requesterEmployee: {
            departmentId: { in: ['department-a'] },
            isActive: true,
          },
          targetEmployee: {
            departmentId: { in: ['department-a'] },
            isActive: true,
          },
        }),
      }),
    );
  });

  it('marks manager approval stale when an employee moved departments', async () => {
    prisma.shiftChangeRequest.findUnique.mockResolvedValueOnce(
      requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER, {
        requesterEmployee: {
          departmentId: 'department-b',
          isActive: true,
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
        targetEmployee: {
          departmentId: 'department-b',
          isActive: true,
        },
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
        targetEmployee: {
          departmentId: 'department-b',
          isActive: true,
        },
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
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(4);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-DEPARTMENT_ADMIN',
        action: AuditAction.SHIFT_CHANGE_MANAGER_APPROVED,
        entityType: AuditEntityType.SHIFT_CHANGE_REQUEST,
        entityId: 'request-1',
        departmentId: 'department-a',
      },
      select: { id: true },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-DEPARTMENT_ADMIN',
        action: AuditAction.SHIFT_CHANGE_MANAGER_APPROVED,
        entityType: AuditEntityType.SHIFT_CHANGE_REQUEST,
        entityId: 'request-1',
        departmentId: 'department-b',
      },
      select: { id: true },
    });
  });

  it('allows Super Admin to approve cross-department requests', async () => {
    mockTransition(
      requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER, {
        targetDepartmentId: 'department-b',
        targetEmployee: {
          departmentId: 'department-b',
          isActive: true,
        },
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
    expect(prisma.shift.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.schedule.update).toHaveBeenCalledTimes(1);
  });

  it('moves both Shift owners on different dates and records technical before/after state', async () => {
    mockTransition(requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER, {
      targetShift: {
        id: 'target-shift', scheduleId: 'schedule-2', employeeId: 'target-employee',
        date: new Date('2026-10-04T00:00:00.000Z'), code: 'N',
        startTime: '20:00', endTime: '08:00', isOff: false, updatedAt: snapshotTime,
      },
    }));
    await service.approve(adminUser(RoleType.SUPER_ADMIN, [null]), 'request-1');
    expect(prisma.shift.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ id: 'requester-shift', updatedAt: snapshotTime }),
      data: { employeeId: 'target-employee' },
    }));
    expect(prisma.shift.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ id: 'target-shift', updatedAt: snapshotTime }),
      data: { employeeId: 'requester-employee' },
    }));
    expect(prisma.schedule.update).toHaveBeenCalledTimes(2);
    expect(prisma.shiftChangeRequestEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      eventType: ShiftChangeRequestEventType.MANAGER_APPROVED,
      metadata: { appliedShifts: expect.arrayContaining([
        expect.objectContaining({ shiftId: 'requester-shift', before: { employeeId: 'requester-employee' }, after: { employeeId: 'target-employee' } }),
        expect.objectContaining({ shiftId: 'target-shift', before: { employeeId: 'target-employee' }, after: { employeeId: 'requester-employee' } }),
      ]) },
    }) });
  });

  it('exchanges only times and codes when both shifts are on the same date', async () => {
    mockTransition(requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER));
    await service.approve(adminUser(RoleType.SUPER_ADMIN, [null]), 'request-1');
    expect(prisma.shift.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: { code: null, startTime: '09:00', endTime: '18:00' },
    }));
    expect(prisma.shift.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: { code: null, startTime: '08:00', endTime: '17:00' },
    }));
    expect(prisma.shift.findFirst).not.toHaveBeenCalled();
  });

  it('reassigns a COVER source Shift to the recipient', async () => {
    mockTransition(requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER, {
      kind: ShiftChangeRequestKind.COVER, targetShiftId: null,
      targetShift: null, targetShiftUpdatedAt: null,
    }));
    await service.approve(adminUser(RoleType.SUPER_ADMIN, [null]), 'request-1');
    expect(prisma.shift.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.shift.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ employeeId: 'requester-employee', isOff: false }),
      data: { employeeId: 'target-employee' },
    }));
    expect(prisma.shiftChangeRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ShiftChangeRequestStatus.MANAGER_APPROVED }),
    }));
  });

  it('rejects occupied destination including OFF before changing any Shift or status', async () => {
    prisma.shiftChangeRequest.findUnique.mockResolvedValueOnce(requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER, {
      kind: ShiftChangeRequestKind.COVER, targetShiftId: null,
      targetShift: null, targetShiftUpdatedAt: null,
    }));
    prisma.shift.findFirst.mockResolvedValueOnce({ id: 'off-or-other-shift' });
    await expect(service.approve(adminUser(RoleType.SUPER_ADMIN, [null]), 'request-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.shift.updateMany).not.toHaveBeenCalled();
    expect(prisma.shiftChangeRequest.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a manager whose active database membership was revoked', async () => {
    prisma.shiftChangeRequest.findUnique.mockResolvedValueOnce(requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER));
    prisma.user.findUnique.mockResolvedValueOnce({ isActive: true, memberships: [] });
    await expect(service.approve(adminUser(RoleType.DEPARTMENT_ADMIN, ['department-a']), 'request-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.shift.updateMany).not.toHaveBeenCalled();
  });

  it('does not record approval if a guarded source Shift update loses a race', async () => {
    prisma.shiftChangeRequest.findUnique.mockResolvedValueOnce(requestRecord(ShiftChangeRequestStatus.PENDING_MANAGER));
    prisma.shift.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.approve(adminUser(RoleType.SUPER_ADMIN, [null]), 'request-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.shiftChangeRequest.updateMany).not.toHaveBeenCalled();
    expect(prisma.shiftChangeRequestEvent.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
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
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: admin.id,
        action: AuditAction.SHIFT_CHANGE_MANAGER_REJECTED,
        entityType: AuditEntityType.SHIFT_CHANGE_REQUEST,
        entityId: 'request-1',
        departmentId: 'department-a',
      },
      select: { id: true },
    });
  });
});
