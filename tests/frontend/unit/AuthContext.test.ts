import { describe, expect, it } from 'vitest';

import { hasCapability, hasManagementAccess } from '../../../src/auth/AuthContext';
import { AuthUser } from '../../../src/api/auth';

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


describe('hasCapability', () => {
  it('treats SUPER_ADMIN and DEPARTMENT_ADMIN as effective department capability holders', () => {
    expect(hasCapability(user('SUPER_ADMIN'), 'AUDIT_READ')).toBe(true);
    expect(
      hasCapability(user('DEPARTMENT_ADMIN'), 'AUDIT_READ', 'department-a'),
    ).toBe(true);
    expect(
      hasCapability(user('DEPARTMENT_ADMIN'), 'AUDIT_READ', 'department-b'),
    ).toBe(false);
  });

  it('allows DEPUTY only through explicit persisted capability', () => {
    const deputy = user('DEPUTY');
    deputy.memberships[0].permissions = ['AUDIT_READ'];

    expect(hasCapability(deputy, 'AUDIT_READ')).toBe(true);
    expect(
      hasCapability(deputy, 'AUDIT_READ', 'department-a'),
    ).toBe(true);
    expect(
      hasCapability(deputy, 'AUDIT_READ', 'department-b'),
    ).toBe(false);
    expect(hasCapability(user('DEPUTY'), 'AUDIT_READ')).toBe(false);
  });
});
