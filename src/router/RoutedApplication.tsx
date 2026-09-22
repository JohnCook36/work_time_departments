import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthGate } from '../auth/AuthGate';
import { ErrorBoundary } from '../ErrorBoundary';
import { AppRouter } from './AppRouter';

export function RoutedApplication() {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {/* Preserve the existing session/onboarding gate for every route,
            including 404. Page-specific auth redirects are a later slice. */}
        <AuthGate>
          <AppRouter />
        </AuthGate>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
