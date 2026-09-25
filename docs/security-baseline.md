# Security Baseline

This checklist is the minimum security gate for Work time departments.
The current trust boundaries and residual risks are documented in
`docs/security-threat-model.md`.
It complements roadmap task #43 (security audit) and applies to future auth,
roles, permissions, PII, export/print and backend changes.

## Data classification

- **Work data:** departments, employee display names, schedules, wishes and work events.
- **Personal data:** phone numbers, account links and future private profile fields.
- **Sensitive operational data:** session tokens, OTP challenges, credentials, secrets,
  database URLs, private addresses and audit/security evidence.
- Do not place secrets or sensitive operational data in frontend state, browser logs,
  API documentation examples, fixtures committed to Git or user-visible error text.

## Access control

- Authorization is enforced on the backend. Frontend visibility is UX only.
- Use least privilege and explicit department scope.
- `DEPUTY` does not receive management access implicitly.
- Object lookup by id must still verify ownership/scope (IDOR protection).
- Security-sensitive writes require regression tests for allowed and denied roles.

## Authentication and sessions

- Session tokens are opaque, stored server-side as hashes and transported by HttpOnly cookies
  or the explicitly supported bearer transport.
- Production cookies must remain `HttpOnly`, `Secure` and use the defined SameSite policy.
- The deployment topology must match that policy: with the current `SameSite=Lax` cookie, frontend/backend should be same-site or the alternative cross-site cookie/session design must be explicitly reviewed and browser-tested. Do not switch to `SameSite=None` blindly.
- OTP codes are never logged or documented with production examples.
- OTP attempt limits and challenge consumption must remain atomic under concurrency.
- Logout must revoke the server session and browser-private planner data for that account.
- Production OTP must not fall back to the development code.

## HTTP / browser boundary

Enforced by `server/src/security/http-security.ts`:

- exact configured `FRONTEND_ORIGIN`; production startup fails if it is missing;
- credentialed CORS only for the configured origin;
- state-changing browser requests with another `Origin` are rejected;
- non-browser clients without `Origin` remain supported;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: no-referrer`;
- restrictive camera/microphone/geolocation `Permissions-Policy`;
- `Cross-Origin-Opener-Policy: same-origin`;
- `Cache-Control: no-store`;
- HSTS in production.

A Content Security Policy is intentionally not enabled yet because Swagger UI is served by
this backend. Add CSP only with a tested policy that keeps the required documentation flow working.

## Validation and mutations

- Validate all externally supplied ids, dates, times, enum values and collection sizes.
- Never trust frontend-computed permissions or hidden controls.
- Preserve optimistic concurrency checks for mutable planner entities.
- Bulk operations must be atomic or report partial behavior explicitly.
- Destructive changes require an explicit product flow; no hidden cascade behavior.

## PII, logs, export and print

- Logs must not contain session tokens, OTP codes, phone numbers unless explicitly redacted,
  private addresses, secrets or raw database URLs.
- Export/print endpoints and client flows must obey the same department scope as the source view.
- Browser cache must be account-scoped; account switching must not expose previous account data.
- Any future private employee profile fields need separate DTOs and permission checks.

## Secrets and environment

- Secrets belong in deployment/environment configuration, never in Git.
- Production frontend builds must explicitly set the real HTTPS `VITE_API_URL` and canonical server planner flags; relying on the localhost fallback is a release failure.
- Backend `FRONTEND_ORIGIN` must exactly match the deployed frontend origin. Green build/deploy-preview status does not prove runtime frontend↔backend session connectivity.
- `.env.example` contains placeholders only.
- Production must use unique secrets of sufficient length.
- Never bypass a missing production integration by enabling a development credential/code.

## Database, migrations and backups

- Prisma constraints are part of the security boundary; keep uniqueness and ownership invariants.
- Destructive migrations require an explicit migration/recovery plan.
- Do not use force reset against production data.
- Backup/restore access must be restricted and tested before production readiness.

## Dependencies

- Review dependency changes deliberately.
- Do not run blind `npm audit fix --force`.
- Security dependency upgrades must pass normal tests, typecheck and build.

## Required regression coverage

Security-sensitive PRs should include, where relevant:

- allowed + denied role/scope tests;
- cross-account isolation tests;
- invalid/stale/concurrent mutation tests;
- HTTP/CORS/origin/session lifecycle tests;
- production-like browser verification of OTP/session cookies across the actual frontend/backend origins before release;
- E2E checks when browser state or routing changes.

## Merge gate

Before merging auth/roles/permissions/PII/security-sensitive work:

1. branch is based on current `main`;
2. focused regression tests are added;
3. root/server typecheck and build pass as applicable;
4. GitHub CI is green;
5. no secrets/PII are added to fixtures, logs or docs;
6. user acceptance is recorded when the task requires manual verification;
7. roadmap/handoff records what was verified and what remains.

This baseline does **not** mean roadmap #43 is complete. Live database
IDOR/concurrency verification, production SMS readiness, dependency/secrets review,
PII/logging review, backup/restore and a final repeat security audit remain separate gates.
