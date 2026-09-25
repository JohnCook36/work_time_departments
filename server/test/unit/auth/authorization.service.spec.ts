import {
  PermissionCapability,
  RoleType,
} from '@prisma/client';

import { AuthUserContext } from '../../../src/auth/auth.service';
import { AuthorizationService } from '../../../src/auth/authorization.service';

function userWith(
  role: RoleType,
  departmentId: string | null,
  permissions: PermissionCapability[] = [],
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
        permissions,
      },
    ],
  };
}

describe('AuthorizationService', () => {
  const service = new AuthorizationService();

  it('allows Super Admin across departments and capabilities', () => {
    const user = userWith(RoleType.SUPER_ADMIN, null);

    expect(service.canAdministerDepartment(user, 'department-b')).toBe(true);
    expect(
      service.hasCapability(
        user,
        PermissionCapability.PRIVATE_PROFILE_EDIT,
        'department-b',
      ),
    ).toBe(true);
  });

  it('allows Department Admin capabilities only in its own department', () => {
    const user = userWith(RoleType.DEPARTMENT_ADMIN, 'department-a');

    expect(service.canAdministerDepartment(user, 'department-a')).toBe(true);
    expect(service.canAdministerDepartment(user, 'department-b')).toBe(false);
    expect(
      service.hasCapability(
        user,
        PermissionCapability.SCHEDULE_PUBLISH,
        'department-a',
      ),
    ).toBe(true);
    expect(
      service.hasCapability(
        user,
        PermissionCapability.SCHEDULE_PUBLISH,
        'department-b',
      ),
    ).toBe(false);
  });

  it('grants Deputy only explicitly assigned capabilities in its department', () => {
    const user = userWith(RoleType.DEPUTY, 'department-a', [
      PermissionCapability.SCHEDULE_READ,
      PermissionCapability.SHIFT_CHANGE_APPROVE,
    ]);

    expect(
      service.hasCapability(
        user,
        PermissionCapability.SCHEDULE_READ,
        'department-a',
      ),
    ).toBe(true);
    expect(
      service.hasCapability(
        user,
        PermissionCapability.SHIFT_CHANGE_APPROVE,
        'department-a',
      ),
    ).toBe(true);
    expect(
      service.hasCapability(
        user,
        PermissionCapability.EMPLOYEE_MANAGE,
        'department-a',
      ),
    ).toBe(false);
    expect(
      service.hasCapability(
        user,
        PermissionCapability.SCHEDULE_READ,
        'department-b',
      ),
    ).toBe(false);
    expect(service.canAdministerDepartment(user, 'department-a')).toBe(false);
  });

  it('does not grant management capability to Employee by role alone', () => {
    const user = userWith(RoleType.EMPLOYEE, 'department-a');

    expect(
      service.hasCapability(
        user,
        PermissionCapability.SCHEDULE_EDIT,
        'department-a',
      ),
    ).toBe(false);
  });

  it('requires the capability over every affected department', () => {
    const user: AuthUserContext = {
      ...userWith(RoleType.DEPUTY, 'department-a'),
      memberships: [
        {
          id: 'membership-a',
          role: RoleType.DEPUTY,
          departmentId: 'department-a',
          permissions: [PermissionCapability.SCHEDULE_EDIT],
        },
        {
          id: 'membership-b',
          role: RoleType.DEPUTY,
          departmentId: 'department-b',
          permissions: [PermissionCapability.SCHEDULE_EDIT],
        },
      ],
    };

    expect(() =>
      service.assertCapabilityForDepartments(
        user,
        PermissionCapability.SCHEDULE_EDIT,
        ['department-a', 'department-b'],
      ),
    ).not.toThrow();
    expect(() =>
      service.assertCapabilityForDepartments(
        user,
        PermissionCapability.SCHEDULE_EDIT,
        ['department-a', 'department-c'],
      ),
    ).toThrow('You do not have permission to perform this action');
  });

  it('lists only departments where the membership has the requested capability', () => {
    const user: AuthUserContext = {
      ...userWith(RoleType.DEPUTY, 'department-a'),
      memberships: [
        {
          id: 'membership-a',
          role: RoleType.DEPUTY,
          departmentId: 'department-a',
          permissions: [PermissionCapability.ONBOARDING_REVIEW],
        },
        {
          id: 'membership-b',
          role: RoleType.DEPUTY,
          departmentId: 'department-b',
          permissions: [PermissionCapability.SCHEDULE_READ],
        },
      ],
    };

    expect(
      service.departmentIdsForCapability(
        user,
        PermissionCapability.ONBOARDING_REVIEW,
      ),
    ).toEqual(['department-a']);
  });
});
