import { ForbiddenException } from '@nestjs/common';
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
    },
  };
  const service = new DepartmentsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    prisma.department.findMany.mockReset();
    prisma.department.findMany.mockResolvedValue([]);
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
});
