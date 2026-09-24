# Work time departments

Приложение для планирования смен: React + TypeScript + Vite + Emotion, backend — NestJS + PostgreSQL + Prisma. Авторизация по телефону, подтверждение привязки профиля сотрудника, planner, расчёт дневных/ночных часов, пожелания, Excel и печать.

## Локальный запуск

Требуется Node.js 22. Backend и базу данных запустите по инструкции в [server/README.md](server/README.md).

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Локально frontend запускается на `http://localhost:5173`, backend — на `http://localhost:3000`. Эти порты не должны совпадать.

Frontend обращается к `VITE_API_URL` (по умолчанию `http://localhost:3000`) с существующей cookie session. Для локального OTP используйте конфигурацию backend; production SMS provider пока не подключён.

Для обычного локального запуска `.env.example` включает server-backed planner: `VITE_SERVER_PLANNER_READ=1` и `VITE_SERVER_PLANNER_WRITE=1`. Write подразумевает read. Legacy local mode остаётся только для отладки/миграционных проверок при явном выставлении обоих флагов в `0`. В server mode источником данных служит backend, без fallback на planner localStorage.

## Структура

- `src/pages/` — route-level композиция; `src/router/` — маршруты, redirects и guards.
- `src/screens/` — auth/onboarding/planner/personal schedule сценарии и screen composition.
- `src/components/` — reusable presentation UI, drawers и schedule components.
- `src/auth/` — canonical session provider и user context; `src/hooks/` — application/UI orchestration.
- `src/api/` — HTTP clients и wire contracts.
- `src/domain/` — модели и чистые правила расписания, расчёты часов и применение импортированных смен.
- `src/services/` — Excel file adapters и печать; `src/utils/` — общие календарные helpers.
- `src/theme/` — единая palette, semantic tokens, Emotion theme и общие стили.
- `tests/frontend/{unit,component,integration}/` — Vitest; `tests/frontend/setup.ts` — setup.
- `tests/e2e/` — Playwright.
- `server/src/` — backend production; `server/test/{unit,integration}/` — Jest.
- `server/prisma/` — schema и migrations.

Tests не входят в production tree. Pages не реализуют business logic; API clients не содержат UI. Палитра централизована в `src/theme/palette.ts`, компоненты используют semantic tokens.

Root ErrorBoundary защищает routed application. `/login` и `/onboarding` обслуживают существующие auth scenarios; `/` перенаправляет на `/planner`; доступ к planner получают linked employees. Для неизвестных путей сохранена 404 после проверки сессии.

## Проверки

```bash
npm test
npm run typecheck
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

Backend проверки запускаются из `server/`:

```bash
npm ci
npm run prisma:generate
npm run prisma:validate
npm test
npm run typecheck
npm run build
```

Для Prisma задайте `DATABASE_URL` согласно `server/.env.example`. HTTP/Jest и Playwright regression tests используют mocks; их прохождение не подтверждает production SMS или интеграцию с живой БД.

## Сборка и deploy

`npm run build` генерирует `dist/`. Netlify использует эту команду и SPA fallback из `netlify.toml`; backend разворачивается отдельно. `dist/` и `node_modules/` не хранятся в Git. Старый standalone-прототип `site/` удалён; актуальное приложение запускается через Vite и использует backend auth.

## Excel export

В «Управление графиком» → «Excel» выберите весь текущий месяц или полную
календарную неделю Пн–Вс. Недели совпадают с диапазонами печати, включая даты
соседних месяцев. В серверном режиме соседний период загружается через API;
при ошибке файл не скачивается, можно повторить экспорт.

Листы «График» и «Часы» сохраняют порядок отделов и сотрудников. Один сотрудник
занимает одну строку; смены содержат полное время, выходные — OFF. Дневные, ночные
и итоговые часы рассчитываются общим движком только для выбранных дат. Месячный
формат и имя файла сохранены; недельный файл содержит даты начала и конца.
