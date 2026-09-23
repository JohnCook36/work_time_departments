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
