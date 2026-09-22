import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { AuthUser } from '../api/auth';
import { hasManagementAccess } from '../auth/AuthContext';
import { useAuthSession } from '../auth/AuthSessionProvider';
import { AuthCard, AuthPage } from '../theme/authPageUi';
import {
  SessionErrorText,
  SessionErrorTitle,
  SessionMuted,
  SessionRetryButton,
} from './SessionRoutes.styles';

function homeRoute(user: AuthUser): string {
  if (!user.employee) return '/onboarding';
  return hasManagementAccess(user) ? '/planner' : '/my-schedule';
}

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

export function ProtectedRoute() {
  const { user } = useAuthSession();

  if (!user) return <Navigate to="/login" replace />;
  if (!user.employee) return <Navigate to="/onboarding" replace />;

  return <Outlet />;
}

export function ManagementRoute() {
  const { user } = useAuthSession();

  if (!user) return <Navigate to="/login" replace />;
  if (!user.employee) return <Navigate to="/onboarding" replace />;
  if (!hasManagementAccess(user)) {
    return <Navigate to="/my-schedule" replace />;
  }

  return <Outlet />;
}

export function HomeRoute() {
  const { user } = useAuthSession();

  if (!user) return <Navigate to="/login" replace />;

  return <Navigate to={homeRoute(user)} replace />;
}

export function LoginRoute() {
  const { user } = useAuthSession();

  return user
    ? <Navigate to={homeRoute(user)} replace />
    : <Outlet />;
}

export function OnboardingRoute() {
  const { user } = useAuthSession();

  if (!user) return <Navigate to="/login" replace />;
  return user.employee
    ? <Navigate to={homeRoute(user)} replace />
    : <Outlet />;
}
