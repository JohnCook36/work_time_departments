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


## Operational acceptance commands

Repository helpers keep the production-like evidence reproducible without recording secrets or personal payloads.

### Auth smoke

Run against the real HTTPS backend:

```bash
AUTH_SMOKE_BASE_URL='https://api.example.test' \
AUTH_SMOKE_PHONE='<pilot-test-number>' \
node scripts/gate-a-auth-smoke.mjs
```

The script requests a real provider OTP, accepts the code interactively, verifies the session cookie, calls `/auth/me`, logs out and proves the old session is rejected. It does not print the phone, OTP or cookie.

### Restore rehearsal

Choose one encrypted scheduled backup and restore it into a pre-created empty isolated database:

```bash
BACKUP_FILE='/secure/path/wtd-YYYYMMDD-HHMMSS.dump.age' \
BACKUP_AGE_IDENTITY='/secure/path/restore.agekey' \
RESTORE_DATABASE_URL='postgresql://...' \
bash server/scripts/production-restore-rehearsal.sh
```

The runner verifies the checksum, decrypts only to a protected temporary file, restores with `pg_restore --exit-on-error`, verifies Prisma migration/core-table readability and reports elapsed seconds. It refuses a non-empty restore target and refuses `RESTORE_DATABASE_URL == DATABASE_URL` when the production URL is provided.

Copy `docs/gate-a-evidence-template.md` for the final #05/#25/#43/#86 sign-off. Never commit real credentials, OTPs, cookies, phone numbers, encryption identities or employee data into the evidence record.
