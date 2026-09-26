import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuditPage } from '../pages/AuditPage';
import { LoginPage } from '../pages/LoginPage';
import { OnboardingPage } from '../pages/OnboardingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { PlannerPage } from '../pages/PlannerPage';
import { MySchedulePage } from '../pages/MySchedulePage';
import { ProfilePage } from '../pages/ProfilePage';
import { RoleAccessPage } from '../pages/RoleAccessPage';
import { TasksPage } from '../pages/TasksPage';
import { TeamHoursPage } from '../pages/TeamHoursPage';
import { TodayPage } from '../pages/TodayPage';
import { ShiftRequestsPage } from '../pages/ShiftRequestsPage';
import {
  AuthenticatedHomeRoute,
  CapabilityRoute,
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
          <Route path="/shift-requests" element={<ShiftRequestsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route element={<CapabilityRoute capability="ROLE_MANAGE" />}>
            <Route path="/roles-access" element={<RoleAccessPage />} />
          </Route>
          <Route element={<CapabilityRoute capability="AUDIT_READ" />}>
            <Route path="/audit" element={<AuditPage />} />
          </Route>
          <Route element={<ManagementRoute />}>
            <Route path="/today" element={<TodayPage />} />
            <Route path="/team-hours" element={<TeamHoursPage />} />
            <Route path="/planner" element={<PlannerPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
