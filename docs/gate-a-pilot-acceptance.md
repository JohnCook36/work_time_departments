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
- backend has explicit `WEBAUTHN_RP_ID` and exact HTTPS `WEBAUTHN_ORIGIN`; the RP/origin matches the deployed frontend host;
- browser flow works on desktop and mobile: manager invitation -> one-time activation QR/code -> Passkey registration -> persisted HttpOnly session -> `/auth/me` -> logout -> Passkey re-login;
- recovery is accepted: scoped manager reset revokes old sessions/passkeys and a fresh one-time invitation can register a new Passkey;
- manager and employee critical flows use the server-backed planner;
- production backup job runs on schedule, creates encrypted backups, rotates them and a restore rehearsal into an isolated database is recorded.

## Pilot stop conditions

Do not open the pilot when any of the following is true:
- production WebAuthn RP/origin is not configured correctly, activation/re-login fails, or recovery can bypass manager scope;
- backup destination/rotation/recovery ownership is unknown;
- a known Critical/High authorization, IDOR or PII leak remains;
- final regression on the candidate deployment is red.

## Evidence record

For the final candidate record:
- commit SHA;
- CI / Backend CI / Playwright run numbers;
- frontend/backend origins used for the smoke;
- activation/Passkey smoke timestamp without raw activation tokens, credential public keys or session cookies;
- backup timestamp, checksum, encrypted destination class, retention and restore duration;
- owner of backup/auth operations;
- final open-risk list.


## Operational acceptance commands

Repository helpers keep the production-like evidence reproducible without recording secrets or personal payloads.

### Passkey auth smoke

Use the real HTTPS frontend/backend pair and a synthetic pilot employee:

1. manager creates an activation invitation;
2. employee scans the QR or enters the fallback code;
3. browser registers a Passkey with user verification;
4. `/auth/me` works through the HttpOnly session;
5. logout invalidates the session;
6. Passkey login restores a new session without a new manager invitation;
7. manager recovery revokes old sessions/Passkeys and a fresh invitation can register access again.

Run the flow on both desktop and mobile. Never copy raw activation tokens, WebAuthn responses, public keys or cookies into the evidence record. The legacy phone OTP smoke helper is not part of the current Gate A requirement.

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
