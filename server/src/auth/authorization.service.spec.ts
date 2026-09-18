import { RoleType } from '@prisma/client';

import { AuthUserContext } from './auth.service';
import { AuthorizationService } from './authorization.service';

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

describe('AuthorizationService', () => {
  const service = new AuthorizationService();

  it('allows Super Admin across departments', () => {
    expect(
      service.canAdministerDepartment(
        userWith(RoleType.SUPER_ADMIN, null),
        'department-b',
      ),
    ).toBe(true);
  });

  it('allows Department Admin only in its own department', () => {
    const user = userWith(RoleType.DEPARTMENT_ADMIN, 'department-a');

    expect(service.canAdministerDepartment(user, 'department-a')).toBe(true);
    expect(service.canAdministerDepartment(user, 'department-b')).toBe(false);
  });

  it('does not grant admin rights to Deputy or Employee by role alone', () => {
    expect(
      service.canAdministerDepartment(
        userWith(RoleType.DEPUTY, 'department-a'),
        'department-a',
      ),
    ).toBe(false);

    expect(
      service.canAdministerDepartment(
        userWith(RoleType.EMPLOYEE, 'department-a'),
        'department-a',
      ),
    ).toBe(false);
  });
});
