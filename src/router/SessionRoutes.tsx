import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthSession } from '../auth/AuthSessionProvider';
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

export function ProtectedRoute() {
  const { user } = useAuthSession();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.employee) return <Navigate to="/onboarding" replace />;
  // All linked employees retain planner access until /my-schedule exists.
  return <Outlet />;
}

export function LoginRoute() {
  const { user } = useAuthSession();
  return user
    ? <Navigate to={user.employee ? '/planner' : '/onboarding'} replace />
    : <Outlet />;
}

export function OnboardingRoute() {
  const { user } = useAuthSession();
  if (!user) return <Navigate to="/login" replace />;
  return user.employee ? <Navigate to="/planner" replace /> : <Outlet />;
}
