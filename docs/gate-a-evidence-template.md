# Gate A evidence record

Use this file as a copyable template for the final pilot candidate. Do not commit activation tokens/codes, WebAuthn credential material, session cookies, database credentials, backup encryption identities or private employee data.

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

Use a synthetic pilot employee and the real HTTPS frontend/backend pair.

Record only:

- WebAuthn RP ID:
- WebAuthn frontend origin:
- Activation smoke timestamp (UTC):
- Manager creates one-time invitation: PASS / FAIL
- Desktop QR/code -> Passkey registration -> /auth/me: PASS / FAIL
- Mobile QR/code -> Passkey registration -> /auth/me: PASS / FAIL
- Logout -> Passkey re-login without a new invitation: PASS / FAIL
- Recovery revokes old sessions/Passkeys and issues a fresh invitation: PASS / FAIL
- Management-account reset scope protection: PASS / FAIL
- Initial management bootstrap used: NO / YES + reason
- Cookie/TLS/proxy/origin configuration reviewed: PASS / FAIL

Do not store the raw activation token/code, WebAuthn response, credential public key, authenticator user handle or session cookie in this record.

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
- Legacy/dev OTP not used as the pilot authentication mechanism: PASS / FAIL
- Exact FRONTEND_ORIGIN verified: PASS / FAIL
- TLS/reverse proxy/trusted proxy configuration verified: PASS / FAIL
- Final Critical/High retest: PASS / FAIL
- Final deployed regression: PASS / FAIL
- Remaining accepted risks:
- Gate A decision: READY / NOT READY
