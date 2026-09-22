import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthSessionProvider } from '../auth/AuthSessionProvider';
import { ErrorBoundary } from '../ErrorBoundary';
import { AppRouter } from './AppRouter';

export function RoutedApplication() {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthSessionProvider>
          <AppRouter />
        </AuthSessionProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
