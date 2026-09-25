# Gate A evidence record

Use this file as a copyable template for the final pilot candidate. Do not commit real phone numbers, OTP values, session cookies, provider tokens, database credentials, backup encryption identities or private employee data.

## Candidate

- Commit SHA:
- Acceptance date/time (UTC):
- Operator:
- Frontend HTTPS origin:
- Backend HTTPS origin:

## Repository checks

- CI run:
- Backend CI run:
- Playwright run:
- Open Critical/High findings: none / list references

## Production auth acceptance (#05)

Run:

```bash
AUTH_SMOKE_BASE_URL='https://api.example.test' \
AUTH_SMOKE_PHONE='<pilot-test-number>' \
node scripts/gate-a-auth-smoke.mjs
```

Prefer entering the OTP interactively. If automation requires `AUTH_SMOKE_CODE`, inject it from ephemeral secret storage and never persist it in shell history, CI artifacts or this record.

Record only:

- Provider:
- Smoke timestamp (UTC):
- Desktop browser/session smoke: PASS / FAIL
- Mobile browser/session smoke: PASS / FAIL
- request -> provider delivery -> verify -> /auth/me -> logout -> revoked reuse: PASS / FAIL
- Cookie/TLS/proxy/origin configuration reviewed: PASS / FAIL

## Backup/restore acceptance (#25)

First confirm a scheduled production backup exists in encrypted restricted storage. Then restore one backup into a pre-created **empty isolated database**:

```bash
BACKUP_FILE='/secure/path/wtd-YYYYMMDD-HHMMSS.dump.age' \
BACKUP_AGE_IDENTITY='/secure/path/restore.agekey' \
RESTORE_DATABASE_URL='postgresql://...' \
bash server/scripts/production-restore-rehearsal.sh
```

Record only:

- Scheduled backup timestamp (UTC):
- Encrypted destination class:
- Rotation/retention:
- Backup owner:
- Restore owner:
- Restore rehearsal timestamp (UTC):
- Restore duration seconds:
- Migration/core-table verification: PASS / FAIL
- Alerting for failed scheduled backups: PASS / FAIL

## Final security/release acceptance (#43/#86)

- Production-like secrets inventory reviewed: PASS / FAIL
- Dev OTP disabled: PASS / FAIL
- Exact FRONTEND_ORIGIN verified: PASS / FAIL
- TLS/reverse proxy/trusted proxy configuration verified: PASS / FAIL
- Final Critical/High retest: PASS / FAIL
- Final deployed regression: PASS / FAIL
- Remaining accepted risks:
- Gate A decision: READY / NOT READY
