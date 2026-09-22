import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { OnboardingPage } from '../pages/OnboardingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlannerPage } from '../pages/PlannerPage';
import { MySchedulePage } from '../pages/MySchedulePage';
import {
  AuthenticatedHomeRoute,
  LoginRoute,
  ManagementRoute,
  OnboardingRoute,
  ProtectedRoute,
  SessionRoutes,
} from './SessionRoutes';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<SessionRoutes />}>
        <Route element={<LoginRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route element={<OnboardingRoute />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<AuthenticatedHomeRoute />} />
          <Route path="/my-schedule" element={<MySchedulePage />} />
          <Route element={<ManagementRoute />}>
            <Route path="/planner" element={<PlannerPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
