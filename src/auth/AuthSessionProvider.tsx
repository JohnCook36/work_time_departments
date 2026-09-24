import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, AuthUser, getMe, logout } from '../api/auth';
import {
  clearLegacyPlannerStorage,
  clearPlannerStorageForUser,
} from '../services/storage/plannerStorage';
import { AuthUserContext } from './AuthContext';

type SessionStatus = 'loading' | 'guest' | 'ready' | 'error';
interface AuthSession {
  user: AuthUser | null;
  status: SessionStatus;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthSessionContext = createContext<AuthSession | null>(null);

export function useAuthSession(): AuthSession {
  const session = useContext(AuthSessionContext);
  if (!session) throw new Error('Auth session context is unavailable');
  return session;
}

// One canonical session state; route guards own page selection and redirects.
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [state, setState] = useState<SessionStatus>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState('loading');
    setError(null);

    try {
      const nextUser = await getMe();
      setUser(nextUser);
      setState('ready');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearLegacyPlannerStorage();
        setUser((currentUser) => {
          if (currentUser?.id) {
            clearPlannerStorageForUser(currentUser.id);
          }
          return null;
        });
        setState('guest');
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Backend недоступен',
      );
      setState('error');
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);

    const currentUserId = user?.id;
    clearLegacyPlannerStorage();
    if (currentUserId) {
      clearPlannerStorageForUser(currentUserId);
    }
    setUser(null);
    setState('loading');

    try {
      await logout();
      setState('guest');
    } catch (requestError) {
      setError(
        'Не удалось завершить сессию на сервере. Локальные данные очищены; повторите выход после восстановления связи.',
      );
      setState('error');
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthSessionContext.Provider
      value={{ user, status: state, error, refresh, signOut }}
    >
      <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>
    </AuthSessionContext.Provider>
  );
}
