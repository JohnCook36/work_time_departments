import { ForbiddenException } from '@nestjs/common';
import { RoleType } from '@prisma/client';

import { AuthUserContext } from '../../../src/auth/auth.service';
import { OnboardingService } from '../../../src/onboarding/onboarding.service';

function authUser(
  memberships: AuthUserContext['memberships'],
): AuthUserContext {
  return {
    id: 'user-1',
    phoneE164: '+79991234567',
    employee: {
      id: 'employee-1',
      displayName: 'Employee',
      departmentId: 'department-a',
      departmentName: 'Department A',
      employmentRate: 1,
    },
    memberships,
  };
}

describe('OnboardingService admin departments', () => {
  const findMany = jest.fn();

  const prisma = {
    department: {
      findMany,
    },
  };

  const authorization = {
    assertCanAdministerDepartment: jest.fn(),
  };

  const service = new OnboardingService(
    prisma as never,
    authorization as never,
  );

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it('lets Super Admin review all active departments', async () => {
    await service.listAdminDepartments(
      authUser([
        {
          id: 'membership-super',
          role: RoleType.SUPER_ADMIN,
          departmentId: null,
        },
      ]),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
      }),
    );
  });

  it('limits Department Admin to assigned departments', async () => {
    await service.listAdminDepartments(
      authUser([
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
      ]),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          id: {
            in: ['department-a', 'department-b'],
          },
        },
      }),
    );
  });

  it('does not expose review departments to Employee role', async () => {
    await expect(
      service.listAdminDepartments(
        authUser([
          {
            id: 'membership-employee',
            role: RoleType.EMPLOYEE,
            departmentId: 'department-a',
          },
        ]),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(findMany).not.toHaveBeenCalled();
  });
});


describe('OnboardingService privacy boundary', () => {
  it('does not select account phone data for manager pending requests', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      onboardingRequest: { findMany },
    };
    const authorization = {
      assertCanAdministerDepartment: jest.fn(),
    };
    const service = new OnboardingService(
      prisma as never,
      authorization as never,
    );

    await service.listPendingForDepartment(
      authUser([
        {
          id: 'membership-a',
          role: RoleType.DEPARTMENT_ADMIN,
          departmentId: 'department-a',
        },
      ]),
      'department-a',
    );

    expect(authorization.assertCanAdministerDepartment).toHaveBeenCalledWith(
      expect.anything(),
      'department-a',
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          user: expect.anything(),
        }),
      }),
    );
  });
});
