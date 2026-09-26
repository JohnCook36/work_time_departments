import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthSession } from '../auth/AuthSessionProvider';
import { hasCapability, hasManagementAccess } from '../auth/AuthContext';
import { AuthUser } from '../api/auth';
import { AuthCard, AuthPage } from '../theme/authPageUi';
import {
  SessionErrorText,
  SessionErrorTitle,
  SessionMuted,
  SessionRetryButton,
} from './SessionRoutes.styles';

// Keep the URL unchanged until session resolution; never redirect on network errors.
export function SessionRoutes() {
  const { status: state, error, refresh } = useAuthSession();
  if (state === 'loading') {
    return (
      <AuthPage>
        <SessionMuted>Проверяем сессию…</SessionMuted>
      </AuthPage>
    );
  }

  if (state === 'error') {
    return (
      <AuthPage>
        <AuthCard>
          <SessionErrorTitle>Backend недоступен</SessionErrorTitle>
          <SessionErrorText>{error}</SessionErrorText>
          <SessionRetryButton type="button" onClick={refresh}>
            Повторить
          </SessionRetryButton>
        </AuthCard>
      </AuthPage>
    );
  }

  return <Outlet />;
}

function authenticatedHomePath(user: AuthUser): '/today' | '/my-schedule' {
  return hasManagementAccess(user) ? '/today' : '/my-schedule';
}

export function ProtectedRoute() {
  const { user } = useAuthSession();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.employee) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

export function AuthenticatedHomeRoute() {
  const { user } = useAuthSession();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.employee) return <Navigate to="/onboarding" replace />;
  return <Navigate to={authenticatedHomePath(user)} replace />;
}

export function ManagementRoute() {
  const { user } = useAuthSession();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.employee) return <Navigate to="/onboarding" replace />;
  return hasManagementAccess(user)
    ? <Outlet />
    : <Navigate to="/my-schedule" replace />;
}

export function CapabilityRoute({ capability }: { capability: string }) {
  const { user } = useAuthSession();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.employee) return <Navigate to="/onboarding" replace />;
  return hasCapability(user, capability)
    ? <Outlet />
    : <Navigate to="/my-schedule" replace />;
}

export function LoginRoute() {
  const { user } = useAuthSession();
  return user
    ? (
        <Navigate
          to={user.employee ? authenticatedHomePath(user) : '/onboarding'}
          replace
        />
      )
    : <Outlet />;
}

export function OnboardingRoute() {
  const { user } = useAuthSession();
  if (!user) return <Navigate to="/login" replace />;
  return user.employee
    ? <Navigate to={authenticatedHomePath(user)} replace />
    : <Outlet />;
}
