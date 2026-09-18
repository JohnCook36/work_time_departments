# Work time departments backend

Изолированная backend-основа на NestJS, PostgreSQL и Prisma. Frontend пока не подключён к backend и продолжает работать самостоятельно.

## Локальный запуск

```bash
npm install
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
