# Work time departments backend

Backend на NestJS, PostgreSQL и Prisma. Основной auth-flow: manager-issued activation + Passkey/WebAuthn + HttpOnly session; legacy phone OTP остаётся только как migration/development fallback.

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

## Passkey/WebAuthn — основной auth-flow

Канонический сценарий описан в [docs/passkey-auth.md](../docs/passkey-auth.md).

Основные маршруты:

- `POST /auth/activation/employees/:employeeId/invitation` — manager-issued activation;
- `POST /auth/activation/employees/:employeeId/recovery` — scoped recovery/reset;
- `POST /auth/activation/resolve`;
- `POST /auth/passkey/registration/options`;
- `POST /auth/passkey/registration/verify`;
- `POST /auth/passkey/authentication/options`;
- `POST /auth/passkey/authentication/verify`;
- `GET /auth/passkeys`;
- `DELETE /auth/passkeys/:credentialId`;
- `GET /auth/me`;
- `POST /auth/logout`.

Для production обязательны `WEBAUTHN_RP_ID`, точный HTTPS `WEBAUTHN_ORIGIN` и корректная cookie/reverse-proxy topology. Passkey login создаёт 90-дневную server-side session. Новый manager QR не нужен после обычного logout/истечения local state, если у пользователя остаётся активный Passkey.

Первый уже существующий management-account без Passkey активируется server-shell командой `npm run auth:bootstrap-passkey -- <employee-id>` с явным `AUTH_BOOTSTRAP_CONFIRM=INITIAL_PASSKEY_BOOTSTRAP`.

Legacy OTP endpoints сохранены временно для migration/development compatibility. Development OTP остаётся fail-closed без явного `AUTH_ALLOW_DEV_OTP=true`; production pilot не требует SMS provider.

## Фактическое время · backend foundation #75

WorkSession хранит серверные check-in/check-out timestamps отдельно от плановых Shift.
Отдел фиксируется в самой записи: перевод сотрудника не переносит его
историческое время в новый management scope. Незакрытую запись прежнего
отдела после перевода завершает уполномоченный руководитель корректировкой.
Запись может быть исправлена только пользователем с
`ATTENDANCE_CORRECT` в данном отделе; первоначальные и новые timestamps
остаются в неизменяемых событиях и AuditLog. Management-чтение требует
`ATTENDANCE_READ`, выдача QR — `ATTENDANCE_QR_MANAGE`, а сотрудник видит
только свои записи.

`ATTENDANCE_QR_SECRET` — отдельный секрет длиной минимум 32 символа. Без него
выдача и проверка QR недоступны. Подписанный QR действителен 60 секунд,
содержит department ID, случайный nonce и случайный контекст отображения,
но не идентификатор сотрудника и не телефон. Каждый сотрудник может
использовать один и тот же отображаемый QR ровно один раз; для выхода
нужен новый QR. История использования защищена уникальностью по сотруднику
и hash токена. QR является механизмом авторизованной отметки рабочего
времени; отдельная backend-сущность или специальный режим устройства для
его отображения не требуется.

Маршруты: `POST /attendance/qr`, `POST /attendance/check-in`,
`POST /attendance/check-out`, `GET /attendance/me`,
`GET /attendance/department`, `POST /attendance/corrections`,
`PATCH /attendance/sessions/:sessionId`. Чтение ограничено периодом до
31 дня и максимум 100 записей за запрос; для полного архива нужна
отдельная пагинация. WorkSession остаётся самостоятельным source of truth
для факта. Management plan/fact сопоставляет его с immutable
SchedulePublication, не подменяя planned hours и не считая фактическое
время автоматически оплачиваемым.

## Swagger / OpenAPI

После запуска backend:

- Swagger UI: `/docs`.
- OpenAPI JSON: `/docs/openapi.json`.
- Версия документа берётся из `server/package.json`.

Документ генерируется из существующих Nest controllers и Swagger metadata; отдельного файла со списком маршрутов нет. Описаны health, auth, onboarding, departments, employees, schedules (`/schedule-data`), shift-change-requests и wishes.

Схема `session` использует каноническую HttpOnly cookie `wtd_session`. Основной вход создаёт cookie после успешной WebAuthn registration/authentication verification; legacy `POST /auth/verify-code` сохранён только как совместимый fallback. Swagger UI не может вручную установить HttpOnly Cookie через Authorize. Альтернативная схема `sessionBearer` описывает уже поддерживаемый transport того же непрозрачного session token, не JWT. Guards и role/scope checks остаются обязательными. Содержимое сессий, секреты, коды и реальные персональные примеры в документацию не включаются.

DTO используются только как metadata в `@ApiBody`: runtime validation и optional/nullable semantics остаются в существующих controllers/services. Для Employee/Department update/deactivate обязательна версия `expectedUpdatedAt`. Для Schedule cell: отсутствие поля не задаёт version precondition, `null` требует отсутствия ячейки, строка должна точно совпасть с `Shift.updatedAt`. Одобрение shift-change request атомарно применяет SWAP/COVER к сохранённым **mutable draft Shift** в Serializable transaction и затем переводит request в `MANAGER_APPROVED`; stale/scope/destination conflicts возвращают 409. Существующие `SchedulePublication` immutable и меняются только через отдельный обычный publish новой версии.

`test/integration/openapi.spec.ts` поднимает Nest application с подменённым PrismaService, проверяет схемы, HTTP UI/JSON и сохранение защиты API без PostgreSQL.

## Структура тестов

Production-код находится в `src/`. Jest запускает `test/unit/**/*.spec.ts` и `test/integration/**/*.spec.ts`; Prisma schema invariant test читает канонический `prisma/schema.prisma`. HTTP/OpenAPI suites используют mocks, а Backend CI отдельно запускает live PostgreSQL regressions для security/shift-change invariants и backup/restore smoke. `tsconfig.build.json` исключает `test/` из production build; typecheck проверяет оба дерева.


## Business timezone · #77

`BUSINESS_TIME_ZONE` задаёт каноническую IANA timezone бизнеса для
сопоставления локального времени опубликованного графика с server-time
WorkSession. Frontend/browser timezone не является источником истины.
Для plan/fact backend работает fail-closed, если переменная отсутствует
или содержит невалидную IANA timezone.
