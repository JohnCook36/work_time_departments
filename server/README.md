# Work time departments backend

Backend на NestJS, PostgreSQL и Prisma. Frontend использует phone OTP/session API, onboarding и server-backed planner endpoints.

## Локальный запуск

```bash
npm ci
cp .env.example .env
docker compose up -d
npm run prisma:generate
npm run prisma:migrate:dev
npm run start:dev
```

После запуска health-check доступен по адресу:

```text
GET http://localhost:3000/health
```

Ожидаемый ответ:

```json
{
  "status": "ok"
}
```

По умолчанию контейнер PostgreSQL публикует порт `5433`. Его можно изменить через `POSTGRES_PORT` в локальном `.env`.

## Проверки

```bash
npm run prisma:generate
npm run prisma:validate
npm test
npm run typecheck
npm run build
```

## Авторизация по телефону — текущий этап

Backend содержит OTP/session foundation:

- `POST /auth/request-code`
- `POST /auth/verify-code`
- `GET /auth/me`
- `POST /auth/logout`

Для локальной разработки используется только `AUTH_DEV_OTP_CODE`. Он не возвращается API и не логируется. При `NODE_ENV=production` development OTP отключён, поэтому до production необходимо подключить реального SMS-провайдера.

`AUTH_OTP_PEPPER` обязателен и должен быть уникальным секретом окружения длиной не менее 32 символов.

При локальном `npm run start:dev` backend автоматически загружает `server/.env`. Существующие переменные окружения процесса имеют приоритет над значениями из файла.

## Swagger / OpenAPI

После запуска backend:

- Swagger UI: `/docs`.
- OpenAPI JSON: `/docs/openapi.json`.
- Версия документа берётся из `server/package.json`.

Документ генерируется из существующих Nest controllers и Swagger metadata; отдельного файла со списком маршрутов нет. Описаны health, auth, onboarding, departments, employees, schedules (`/schedule-data`), shift-change-requests и wishes.

Схема `session` использует каноническую HttpOnly cookie `wtd_session`. Вход выполняется через существующий OTP flow; браузер получает cookie после `POST /auth/verify-code`. Swagger UI не может вручную установить HttpOnly Cookie через Authorize. Альтернативная схема `sessionBearer` описывает уже поддерживаемый transport того же непрозрачного session token, не JWT. Guards и role/scope checks остаются обязательными. Содержимое сессий, секреты, коды и реальные персональные примеры в документацию не включаются.

DTO используются только как metadata в `@ApiBody`: runtime validation и optional/nullable semantics остаются в существующих controllers/services. Для Employee/Department update/deactivate обязательна версия `expectedUpdatedAt`. Для Schedule cell: отсутствие поля не задаёт version precondition, `null` требует отсутствия ячейки, строка должна точно совпасть с `Shift.updatedAt`. Одобрение shift-change request переводит его в `MANAGER_APPROVED`, но пока не изменяет Shift.

`test/integration/openapi.spec.ts` поднимает Nest application с подменённым PrismaService, проверяет схемы, HTTP UI/JSON и сохранение защиты API без PostgreSQL.

## Структура тестов

Production-код находится в `src/`. Jest запускает `test/unit/**/*.spec.ts` и `test/integration/**/*.spec.ts`; Prisma schema invariant test читает канонический `prisma/schema.prisma`. HTTP/OpenAPI tests используют mocks и не заменяют проверку с живой PostgreSQL. `tsconfig.build.json` исключает `test/` из production build; typecheck проверяет оба дерева.
