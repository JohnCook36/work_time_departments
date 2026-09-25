import { apiRequest } from './auth';

export type RoleType =
  | 'SUPER_ADMIN'
  | 'DEPARTMENT_ADMIN'
  | 'DEPUTY'
  | 'EMPLOYEE';

export type PermissionCapability =
  | 'SCHEDULE_READ'
  | 'SCHEDULE_EDIT'
  | 'SCHEDULE_PUBLISH'
  | 'EMPLOYEE_MANAGE'
  | 'ONBOARDING_REVIEW'
  | 'SHIFT_CHANGE_APPROVE'
  | 'SCHEDULE_RULE_MANAGE'
  | 'AUDIT_READ'
  | 'PRIVATE_PROFILE_READ'
  | 'PRIVATE_PROFILE_EDIT'
  | 'ROLE_MANAGE';

export interface MembershipAssignment {
  id: string;
  role: RoleType;
  departmentId: string | null;
  permissions: PermissionCapability[];
  employee: {
    id: string;
    displayName: string;
  } | null;
  isActive: boolean;
  updatedAt: string;
}

export interface CreateMembershipAssignmentInput {
  employeeId: string;
  departmentId: string | null;
  role: RoleType;
  permissions?: PermissionCapability[];
}

export function getManageableMemberships(departmentId?: string) {
  const query = departmentId
    ? '?' + new URLSearchParams({ departmentId }).toString()
    : '';
  return apiRequest<MembershipAssignment[]>('/memberships/manageable' + query);
}

export function createMembershipAssignment(
  input: CreateMembershipAssignmentInput,
) {
  return apiRequest<MembershipAssignment>('/memberships', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function replaceMembershipPermissions(
  membershipId: string,
  permissions: PermissionCapability[],
  expectedUpdatedAt: string,
) {
  return apiRequest<MembershipAssignment>(
    '/memberships/' + encodeURIComponent(membershipId) + '/permissions',
    {
      method: 'PATCH',
      body: JSON.stringify({ permissions, expectedUpdatedAt }),
    },
  );
}

export function deactivateMembership(
  membershipId: string,
  expectedUpdatedAt: string,
) {
  return apiRequest<{ status: 'ok'; membershipId: string }>(
    '/memberships/' + encodeURIComponent(membershipId) + '/deactivate',
    {
      method: 'PATCH',
      body: JSON.stringify({ expectedUpdatedAt }),
    },
  );
}
