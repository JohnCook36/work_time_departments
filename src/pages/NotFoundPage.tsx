import React from 'react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1>404 — Страница не найдена</h1>
      <p>Проверьте адрес или вернитесь в приложение.</p>
      <Link to="/planner">Вернуться в приложение</Link>
    </main>
  );
}
