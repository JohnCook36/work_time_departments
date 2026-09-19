import { describe, expect, it } from 'vitest';

import { hasManagementAccess } from './AuthContext';
import { AuthUser } from './api';

function user(role: string): AuthUser {
  return {
    id: 'user-1',
    phoneE164: '+79990000000',
    employee: {
      id: 'employee-1',
      displayName: 'Employee',
      departmentId: 'department-a',
      employmentRate: 1,
      scheduleMode: 'FLEXIBLE',
      fixedStartTime: null,
      fixedEndTime: null,
    },
    memberships: [
      {
        id: 'membership-1',
        role,
        departmentId: role === 'SUPER_ADMIN' ? null : 'department-a',
      },
    ],
  };
}

describe('hasManagementAccess', () => {
  it.each(['SUPER_ADMIN', 'DEPARTMENT_ADMIN'])(
    'allows %s to see management planner data',
    (role) => {
      expect(hasManagementAccess(user(role))).toBe(true);
    },
  );

  it.each(['EMPLOYEE', 'DEPUTY'])(
    'does not grant management planner access to %s by role alone',
    (role) => {
      expect(hasManagementAccess(user(role))).toBe(false);
    },
  );
});
