import { createContext, useContext } from 'react';

import { AuthUser } from '../api/auth';

export const AuthUserContext = createContext<AuthUser | null>(null);

export function useAuthUser(): AuthUser {
  const user = useContext(AuthUserContext);

  if (!user) {
    throw new Error('Authenticated user context is unavailable');
  }

  return user;
}

export function hasManagementAccess(user: AuthUser): boolean {
  return user.memberships.some(
    (membership) =>
      membership.role === 'SUPER_ADMIN' ||
      membership.role === 'DEPARTMENT_ADMIN',
  );
}


export function hasCapability(
  user: AuthUser,
  capability: string,
  departmentId?: string,
): boolean {
  return user.memberships.some((membership) => {
    if (membership.role === 'SUPER_ADMIN') return true;

    if (
      membership.role === 'DEPARTMENT_ADMIN' &&
      (!departmentId || membership.departmentId === departmentId)
    ) {
      return true;
    }

    if (
      departmentId &&
      membership.departmentId !== departmentId
    ) {
      return false;
    }

    return membership.permissions?.includes(capability) ?? false;
  });
}
