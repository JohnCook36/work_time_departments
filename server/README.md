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
