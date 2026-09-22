import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthSessionProvider } from '../auth/AuthSessionProvider';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AppThemeProvider } from '../theme/AppThemeProvider';
import { AppRouter } from './AppRouter';

export function RoutedApplication() {
  return (
    <ErrorBoundary>
      <AppThemeProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthSessionProvider>
            <AppRouter />
          </AuthSessionProvider>
        </BrowserRouter>
      </AppThemeProvider>
    </ErrorBoundary>
  );
}
