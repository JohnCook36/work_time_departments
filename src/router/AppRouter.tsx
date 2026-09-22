import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { LoginPage } from '../pages/LoginPage';
import { MySchedulePage } from '../pages/MySchedulePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OnboardingPage } from '../pages/OnboardingPage';
import { PlannerPage } from '../pages/PlannerPage';
import {
  HomeRoute,
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
          <Route path="/" element={<HomeRoute />} />
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
