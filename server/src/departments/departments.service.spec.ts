import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { RoleType } from '@prisma/client';

import { AuthUserContext } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { DepartmentsService } from './departments.service';

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
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new DepartmentsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.department.findMany.mockResolvedValue([]);
    prisma.department.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        department: {
          findMany: prisma.department.findMany,
          updateMany: prisma.department.updateMany,
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

  it('rejects stale Department optimistic metadata', async () => {
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
