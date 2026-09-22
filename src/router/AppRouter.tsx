import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlannerPage } from '../pages/PlannerPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/planner" replace />} />
      <Route path="/planner" element={<PlannerPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
