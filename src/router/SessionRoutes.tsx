import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthSession } from '../auth/AuthSessionProvider';
import { pageStyle, cardStyle, buttonStyle } from '../theme/authPageUi';
import { authPalette } from '../theme/palette';

// Keep the URL unchanged until session resolution; never redirect on network errors.
export function SessionRoutes() {
  const { status: state, error, refresh } = useAuthSession();
  if (state === 'loading') {
    return (
      <div style={pageStyle}>
        <div style={{ color: authPalette.textMuted }}>Проверяем сессию…</div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0 }}>Backend недоступен</h1>
          <p style={{ color: authPalette.textMuted }}>{error}</p>
          <button type="button" style={buttonStyle} onClick={refresh}>
            Повторить
          </button>
        </div>
      </div>
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
