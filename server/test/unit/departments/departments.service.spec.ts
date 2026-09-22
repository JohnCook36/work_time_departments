import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DepartmentKind, RoleType } from '@prisma/client';

import { AuthUserContext } from '../../../src/auth/auth.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { DepartmentsService } from '../../../src/departments/departments.service';

function userWith(
  role: RoleType,
  departmentId: string | null,
): AuthUserContext {
  return {
    id: 'user-1',
    phoneE164: '+79991234567',
    employee: null,
    memberships: [
      {
        id: 'membership-1',
        role,
        departmentId,
      },
    ],
  };
}

describe('DepartmentsService', () => {
  const prisma = {
    department: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    employee: {
      count: jest.fn(),
    },
    membership: {
      count: jest.fn(),
    },
    onboardingRequest: {
      count: jest.fn(),
    },
    shiftChangeRequest: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new DepartmentsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.department.findMany.mockResolvedValue([]);
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.department.create.mockResolvedValue({
      id: 'department-created',
      name: 'Новый отдел',
      kind: DepartmentKind.GENERAL,
      position: 0,
      isActive: true,
      createdAt: new Date('2026-09-22T08:00:00.000Z'),
      updatedAt: new Date('2026-09-22T08:00:00.000Z'),
    });
    prisma.department.updateMany.mockResolvedValue({ count: 1 });
    prisma.department.count.mockResolvedValue(2);
    prisma.employee.count.mockResolvedValue(0);
    prisma.membership.count.mockResolvedValue(0);
    prisma.onboardingRequest.count.mockResolvedValue(0);
    prisma.shiftChangeRequest.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        department: {
          findMany: prisma.department.findMany,
          findFirst: prisma.department.findFirst,
          create: prisma.department.create,
          updateMany: prisma.department.updateMany,
          count: prisma.department.count,
        },
        employee: {
          count: prisma.employee.count,
        },
        membership: {
          count: prisma.membership.count,
        },
        onboardingRequest: {
          count: prisma.onboardingRequest.count,
        },
        shiftChangeRequest: {
          count: prisma.shiftChangeRequest.count,
        },
      }),
    );
  });

  it('lists every active department for Super Admin', async () => {
    await service.listManageable(userWith(RoleType.SUPER_ADMIN, null));

    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
      }),
    );
  });

  it('scopes Department Admin to the departments in active auth context', async () => {
    const user: AuthUserContext = {
      ...userWith(RoleType.DEPARTMENT_ADMIN, 'department-a'),
      memberships: [
        {
          id: 'membership-a',
          role: RoleType.DEPARTMENT_ADMIN,
          departmentId: 'department-a',
        },
        {
          id: 'membership-b',
          role: RoleType.DEPARTMENT_ADMIN,
          departmentId: 'department-b',
        },
      ],
    };

    await service.listManageable(user);

    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          id: { in: ['department-a', 'department-b'] },
        },
      }),
    );
  });

  it.each([RoleType.DEPUTY, RoleType.EMPLOYEE])(
    'rejects %s without management permission',
    (role) => {
      expect(() =>
        service.listManageable(userWith(role, 'department-a')),
      ).toThrow(ForbiddenException);

      expect(prisma.department.findMany).not.toHaveBeenCalled();
    },
  );

  it('creates a Department after the last active position for Super Admin', async () => {
    prisma.department.findFirst.mockResolvedValue({ position: 4 });

    await service.createDepartment(
      userWith(RoleType.SUPER_ADMIN, null),
      {
        name: ' Новый отдел ',
        kind: DepartmentKind.FO,
      },
    );

    expect(prisma.department.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Новый отдел',
          kind: DepartmentKind.FO,
          position: 5,
        },
      }),
    );
  });

  it('forbids Department Admin from creating global Department structure', async () => {
    await expect(
      service.createDepartment(
        userWith(RoleType.DEPARTMENT_ADMIN, 'department-a'),
        {
          name: 'Новый отдел',
          kind: DepartmentKind.GENERAL,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates Department fields with optimistic locking', async () => {
    const updatedAt = new Date('2026-09-22T08:00:00.000Z');
    prisma.department.findFirst
      .mockResolvedValueOnce({
        id: 'department-a',
        updatedAt,
      })
      .mockResolvedValueOnce({
        id: 'department-a',
        name: 'Front Office',
        kind: DepartmentKind.FO,
        position: 0,
        isActive: true,
        createdAt: new Date('2026-09-20T08:00:00.000Z'),
        updatedAt: new Date('2026-09-22T08:01:00.000Z'),
      });

    await service.updateDepartment(
      userWith(RoleType.SUPER_ADMIN, null),
      'department-a',
      {
        name: 'Front Office',
        kind: DepartmentKind.FO,
        expectedUpdatedAt: updatedAt.toISOString(),
      },
    );

    expect(prisma.department.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'department-a',
        isActive: true,
        updatedAt,
      },
      data: {
        name: 'Front Office',
        kind: DepartmentKind.FO,
      },
    });
  });

  it('rejects a stale Department edit', async () => {
    prisma.department.findFirst.mockResolvedValue({
      id: 'department-a',
      updatedAt: new Date('2026-09-22T09:00:00.000Z'),
    });

    await expect(
      service.updateDepartment(
        userWith(RoleType.SUPER_ADMIN, null),
        'department-a',
        {
          name: 'Новое имя',
          expectedUpdatedAt: '2026-09-22T08:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.department.updateMany).not.toHaveBeenCalled();
  });

  it('requires at least one mutable Department field for edit', async () => {
    await expect(
      service.updateDepartment(
        userWith(RoleType.SUPER_ADMIN, null),
        'department-a',
        {
          expectedUpdatedAt: '2026-09-22T08:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft-deactivates an empty Department and keeps historical rows intact', async () => {
    const updatedAt = new Date('2026-09-22T08:00:00.000Z');
    prisma.department.findFirst.mockResolvedValue({
      id: 'department-a',
      updatedAt,
    });

    const result = await service.deactivateDepartment(
      userWith(RoleType.SUPER_ADMIN, null),
      'department-a',
      {
        expectedUpdatedAt: updatedAt.toISOString(),
      },
    );

    expect(prisma.department.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'department-a',
        isActive: true,
        updatedAt,
      },
      data: {
        isActive: false,
      },
    });
    expect(result).toEqual({
      status: 'ok',
      departmentId: 'department-a',
    });
  });

  it('blocks Department deactivation while active Employees remain', async () => {
    prisma.department.findFirst.mockResolvedValue({
      id: 'department-a',
      updatedAt: new Date('2026-09-22T08:00:00.000Z'),
    });
    prisma.employee.count.mockResolvedValue(1);

    await expect(
      service.deactivateDepartment(
        userWith(RoleType.SUPER_ADMIN, null),
        'department-a',
        {
          expectedUpdatedAt: '2026-09-22T08:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.department.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['active Membership', 'membership'],
    ['pending onboarding request', 'onboardingRequest'],
    ['active shift-change request', 'shiftChangeRequest'],
  ] as const)(
    'blocks Department deactivation while %s remains',
    async (_label, blocker) => {
      prisma.department.findFirst.mockResolvedValue({
        id: 'department-a',
        updatedAt: new Date('2026-09-22T08:00:00.000Z'),
      });
      prisma[blocker].count.mockResolvedValue(1);

      await expect(
        service.deactivateDepartment(
          userWith(RoleType.SUPER_ADMIN, null),
          'department-a',
          {
            expectedUpdatedAt: '2026-09-22T08:00:00.000Z',
          },
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.department.updateMany).not.toHaveBeenCalled();
    },
  );

  it('blocks deactivation of the final active Department', async () => {
    prisma.department.findFirst.mockResolvedValue({
      id: 'department-a',
      updatedAt: new Date('2026-09-22T08:00:00.000Z'),
    });
    prisma.department.count.mockResolvedValue(1);

    await expect(
      service.deactivateDepartment(
        userWith(RoleType.SUPER_ADMIN, null),
        'department-a',
        {
          expectedUpdatedAt: '2026-09-22T08:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('atomically reorders all active departments for Super Admin', async () => {
    const firstUpdatedAt = new Date('2026-09-19T09:00:00.000Z');
    const secondUpdatedAt = new Date('2026-09-19T09:05:00.000Z');
    prisma.department.findMany.mockResolvedValue([
      { id: 'department-a', updatedAt: firstUpdatedAt },
      { id: 'department-b', updatedAt: secondUpdatedAt },
    ]);

    const result = await service.reorderDepartments(
      userWith(RoleType.SUPER_ADMIN, null),
      {
        orderedDepartmentIds: ['department-b', 'department-a'],
        expectedUpdatedAtByDepartmentId: {
          'department-a': firstUpdatedAt.toISOString(),
          'department-b': secondUpdatedAt.toISOString(),
        },
      },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.department.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: 'department-b',
          isActive: true,
          updatedAt: secondUpdatedAt,
        },
        data: { position: 0 },
      }),
    );
    expect(prisma.department.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: 'department-a',
          isActive: true,
          updatedAt: firstUpdatedAt,
        },
        data: { position: 1 },
      }),
    );
    expect(result).toEqual({ status: 'ok', reordered: 2 });
  });

  it('forbids Department Admin from changing the global department order', async () => {
    await expect(
      service.reorderDepartments(
        userWith(RoleType.DEPARTMENT_ADMIN, 'department-a'),
        {
          orderedDepartmentIds: ['department-a'],
          expectedUpdatedAtByDepartmentId: {
            'department-a': '2026-09-19T09:00:00.000Z',
          },
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reorder when the active Department set changed', async () => {
    prisma.department.findMany.mockResolvedValue([
      {
        id: 'department-a',
        updatedAt: new Date('2026-09-19T09:00:00.000Z'),
      },
    ]);

    await expect(
      service.reorderDepartments(
        userWith(RoleType.SUPER_ADMIN, null),
        {
          orderedDepartmentIds: ['department-a', 'department-b'],
          expectedUpdatedAtByDepartmentId: {
            'department-a': '2026-09-19T09:00:00.000Z',
            'department-b': '2026-09-19T09:05:00.000Z',
          },
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.department.updateMany).not.toHaveBeenCalled();
  });

  it('rejects stale Department optimistic metadata for reorder', async () => {
    prisma.department.findMany.mockResolvedValue([
      {
        id: 'department-a',
        updatedAt: new Date('2026-09-19T10:00:00.000Z'),
      },
    ]);

    await expect(
      service.reorderDepartments(
        userWith(RoleType.SUPER_ADMIN, null),
        {
          orderedDepartmentIds: ['department-a'],
          expectedUpdatedAtByDepartmentId: {
            'department-a': '2026-09-19T09:00:00.000Z',
          },
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.department.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back when a conditional Department position update loses a race', async () => {
    const firstUpdatedAt = new Date('2026-09-19T09:00:00.000Z');
    const secondUpdatedAt = new Date('2026-09-19T09:05:00.000Z');
    prisma.department.findMany.mockResolvedValue([
      { id: 'department-a', updatedAt: firstUpdatedAt },
      { id: 'department-b', updatedAt: secondUpdatedAt },
    ]);
    prisma.department.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.reorderDepartments(
        userWith(RoleType.SUPER_ADMIN, null),
        {
          orderedDepartmentIds: ['department-b', 'department-a'],
          expectedUpdatedAtByDepartmentId: {
            'department-a': firstUpdatedAt.toISOString(),
            'department-b': secondUpdatedAt.toISOString(),
          },
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects duplicate Department ids before starting a transaction', async () => {
    await expect(
      service.reorderDepartments(
        userWith(RoleType.SUPER_ADMIN, null),
        {
          orderedDepartmentIds: ['department-a', 'department-a'],
          expectedUpdatedAtByDepartmentId: {
            'department-a': '2026-09-19T09:00:00.000Z',
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
