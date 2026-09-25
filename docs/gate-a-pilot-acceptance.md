# Gate A pilot acceptance

Gate A is the release gate for the MVP owner demo / limited pilot. Passing repository CI alone is necessary but not sufficient.

## Repository acceptance

A candidate commit must have:
- root CI green: frontend unit/component/integration tests, typecheck and production build;
- Backend CI green: dependency audit, Prisma validation/migrations, unit tests, live PostgreSQL security tests, typecheck/build and backup/restore smoke;
- Playwright acceptance green when the change touches browser flows;
- no known open Critical/High security defect in the current MVP scope.

## Production-like acceptance

The deployment must prove:
- production frontend has explicit `VITE_API_URL` and `VITE_SERVER_PLANNER_WRITE=1`;
- backend has an explicit `FRONTEND_ORIGIN`, TLS/reverse-proxy configuration and secret storage;
- production OTP delivery uses `AUTH_OTP_PROVIDER_URL` over HTTPS with `AUTH_OTP_PROVIDER_TOKEN`; fixed dev OTP is disabled;
- browser flow works on desktop and mobile: request code -> provider delivery -> verify -> persisted HttpOnly session -> `/auth/me` -> logout -> unauthorized reuse;
- manager and employee critical flows use the server-backed planner;
- production backup job runs on schedule, creates encrypted backups, rotates them and a restore rehearsal into an isolated database is recorded.

## Pilot stop conditions

Do not open the pilot when any of the following is true:
- production OTP delivery is not configured or fails closed;
- backup destination/rotation/recovery ownership is unknown;
- a known Critical/High authorization, IDOR or PII leak remains;
- final regression on the candidate deployment is red.

## Evidence record

For the final candidate record:
- commit SHA;
- CI / Backend CI / Playwright run numbers;
- frontend/backend origins used for the smoke;
- OTP provider smoke timestamp without raw phone/code payloads;
- backup timestamp, checksum, encrypted destination class, retention and restore duration;
- owner of backup/auth operations;
- final open-risk list.
