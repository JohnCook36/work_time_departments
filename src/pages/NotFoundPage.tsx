import React from 'react';
import { Link } from 'react-router-dom';

import { NotFoundLayout } from './NotFoundPage.styles';

export function NotFoundPage() {
  return (
    <NotFoundLayout>
      <h1>404 — Страница не найдена</h1>
      <p>Проверьте адрес или вернитесь в приложение.</p>
      <Link to="/planner">Вернуться в приложение</Link>
    </NotFoundLayout>
  );
}
