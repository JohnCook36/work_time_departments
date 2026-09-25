# Security Threat Model

This document describes the current security model for Work time departments.
It is a living companion to `docs/security-baseline.md` and roadmap task #43.

It documents current boundaries and known residual risks. It does not by itself
declare the application production-ready.

## Scope

Current in-scope components:

- React/Vite browser client;
- NestJS backend;
- PostgreSQL/Prisma persistence;
- phone OTP authentication and server-side sessions;
- departments, employees, memberships and role/scope authorization;
- schedules, shifts, wishes and fixed-weekday materialization;
- Excel import/export and browser print flows;
- onboarding and shift-change workflows;
- browser planner cache;
- CI/CD security gates.

Future production SMS delivery, private home addresses/taxi automation,
notifications and other not-yet-implemented domains must extend this model
before production use.

## Assets

### Sensitive authentication assets

- OTP challenge hashes and attempt state;
- OTP hashing pepper and environment secrets;
- opaque session tokens;
- stored session token hashes;
- database credentials and deployment secrets.

### Personal data

- account phone number;
- User ↔ Employee linkage;
- future private profile fields and home addresses.

### Work data

- departments and memberships;
- employee display names and employment rates;
- schedules, shifts and OFF entries;
- wishes;
- onboarding state;
- shift-change requests and events;
- exports and print output.

### Security / operational evidence

- migration history;
- CI results;
- audit/security documentation;
- future administrative audit events;
- backup and restore material.

## Actors

### Unauthenticated external actor

Goals can include:

- OTP/SMS abuse;
- brute-force verification;
- session acquisition;
- malformed or oversized requests;
- HTTP-origin abuse;
- denial of service.

### Authenticated Employee

Must only access their permitted personal/work flows and must not gain
management access by manipulating client state or identifiers.

### DEPUTY

Is a distinct role but does not receive management permissions implicitly.
Any future management capability requires an explicit backend permission model.

### DEPARTMENT_ADMIN

May administer only departments granted by active backend memberships.

### SUPER_ADMIN

Has global management capability and therefore represents a high-impact
privileged account.

### Compromised browser/session

An attacker with access to a browser profile or valid session may attempt to
reuse cached planner data, perform mutations, export data or move across
account boundaries.

### Privileged insider

A manager or operator may legitimately see some work data but must not receive
private account fields simply because they have management UI access.

### Supply-chain attacker

Targets vulnerable npm dependencies, CI actions or dependency-resolution
behavior.

## Trust boundaries

### Browser → Backend

The browser is untrusted.

Security decisions must never depend on:

- hidden buttons;
- frontend role checks;
- localStorage content;
- client-supplied Employee/Department ownership;
- client-computed authorization.

Backend authorization is authoritative.

### Backend → PostgreSQL

PostgreSQL is the persistence and concurrency boundary.

Security-sensitive state transitions use:

- database transactions;
- conditional updates;
- uniqueness constraints;
- optimistic concurrency;
- PostgreSQL transaction advisory locking where required.

### Browser storage

Planner cache is convenience data, not an authority.

It is:

- scoped by account id;
- cleared for the current account on logout/session loss;
- not used as a replacement for server-backed authorization;
- cleared even when server logout fails.

### CI / dependency supply chain

Lockfiles and reproducible installs are security boundaries.

Current requirements include:

- `npm ci`;
- no blind `npm audit fix --force`;
- required-runtime High/Critical dependency audit gates;
- tests/typecheck/build after dependency changes.

### Deployment / reverse proxy

The application supports an explicit trusted-proxy hop count through
`AUTH_TRUST_PROXY_HOPS`; raw `X-Forwarded-For` is not trusted by default.

Production still must define and verify the actual proxy topology:

- keep `AUTH_TRUST_PROXY_HOPS=0` unless the exact reverse-proxy chain is known;
- when configured, verify that the selected forwarded address is the real client source;
- confirm that direct socket/source identity does not collapse all clients behind the proxy;
- verify frontend/backend origin and cookie topology in a real browser.

This remains an explicit production-readiness dependency.

### Future SMS provider

The SMS provider will become a separate trust boundary.

Production must not:

- fall back to a fixed development OTP;
- log OTP values;
- expose provider secrets to the browser;
- send without abuse/rate-limit controls.

## Security invariants

The following must remain true:

1. A browser cannot grant itself a role or department scope.
2. A DEPARTMENT_ADMIN cannot read or mutate another department solely by id.
3. DEPUTY is not management unless a future explicit permission grants it.
4. Employee/User linkage must be unique and scope-checked.
5. One OTP challenge cannot create multiple sessions.
6. Same-phone request-code cooldown cannot be bypassed by concurrent requests.
7. Development OTP is disabled unless explicitly opted in and is always disabled
   in production.
8. A session token is never persisted in plaintext.
9. Account A browser cache must not appear as account B data.
10. Logout failure must not preserve browser-private planner data.
11. Existing Shift/OFF state must not be overwritten implicitly by generated 5/2
    schedule materialization.
12. Shift-change requests become invalid when their employee/schedule scope
    becomes stale.
13. Private User/account identifiers are not returned in work-domain DTOs unless
    explicitly required and authorized.
14. Excel/print data cannot broaden the caller's backend department scope.
15. Production dependency High/Critical findings block merge unless explicitly
    classified outside the required runtime tree.

## Threats and controls

### Authentication abuse

Threats:

- OTP brute force;
- concurrent OTP reuse;
- concurrent request-code cooldown bypass;
- fixed development OTP enabled accidentally;
- SMS pumping across many phone numbers.

Current controls:

- normalized phone values;
- OTP HMAC/hash with environment pepper;
- expiry and max-attempt limits;
- atomic attempt reservation;
- atomic challenge consumption before session creation;
- live PostgreSQL concurrency regression tests;
- same-phone request-code serialization through a PostgreSQL transaction
  advisory lock;
- explicit `AUTH_ALLOW_DEV_OTP=true` requirement;
- development OTP always rejected when `NODE_ENV=production`.

Residual risk:

- DB-backed source-level request limits are implemented, but their production effectiveness
  depends on correct proxy/source identity configuration;
- production SMS/equivalent provider is not connected;
- production provider-specific pumping limits/cost controls still need validation.

### Session theft / replay

Current controls:

- cryptographically random opaque tokens;
- only token hashes stored in PostgreSQL;
- HttpOnly cookie;
- SameSite=Lax;
- Secure cookie in production;
- expiry and explicit revocation;
- logout removes browser-private cache even if backend logout fails.

Residual risk:

- final production cookie/domain/TLS deployment must be validated end-to-end;
- the current `SameSite=Lax` session cookie assumes a compatible same-site topology unless
  a separate cross-site design is explicitly reviewed and browser-tested.

### Broken access control / IDOR

Threats:

- reading another department by changing an id;
- changing Employee ownership/scope;
- approving stale onboarding/shift-change requests.

Current controls:

- backend AuthorizationService;
- explicit active memberships;
- live PostgreSQL department-scope tests;
- onboarding scope revalidation inside transaction;
- atomic onboarding resolution;
- atomic Employee-link claim;
- active shift-change requests block Employee department moves;
- shift-change transitions revalidate current Employee scope and stale state.

Residual risk:

- every new domain endpoint must repeat backend ownership/scope checks;
- final repeat IDOR audit is still required before production.

### PII disclosure

Threats:

- exposing account phone to department managers;
- exposing internal User ids through work APIs;
- leaking previous account data through browser cache, export or print.

Current controls:

- User and Employee are separate models;
- onboarding manager API does not expose phone number;
- shift-change responses do not expose internal account ids;
- account-scoped browser cache;
- server-backed data remains authoritative.

Residual risk:

- future private profile/address fields need dedicated private DTOs and permissions;
- final log/export/print privacy review remains required.

### Cross-site / browser boundary attacks

Current controls:

- exact `FRONTEND_ORIGIN`;
- credentialed CORS only for the configured origin;
- state-changing browser requests with a different Origin are rejected;
- HSTS in production;
- nosniff, DENY framing, no-referrer, restrictive Permissions-Policy and COOP;
- no-store response policy.

Residual risk:

- CSP is not enabled because Swagger UI is currently served by the backend;
  any future CSP must be tested rather than added blindly.

### Data integrity / concurrent writes

Current controls include:

- Prisma/PostgreSQL transactions;
- unique schedule/shift constraints;
- optimistic `updatedAt` preconditions;
- atomic multi-department Excel import;
- atomic OTP and onboarding transitions;
- stale shift-change detection.

Current additional controls:

- immutable per-department `SchedulePublication` versions with PostgreSQL protection;
- server-owned publication rule snapshots/versioning;
- shift-change manager approval applies SWAP/COVER atomically in a Serializable transaction
  and preserves immutable published history.

Residual risk:

- every new bulk mutation still needs an explicit transaction/concurrency model and regression coverage.

### Dependency / supply-chain risk

Current controls:

- lockfiles;
- `npm ci`;
- required-runtime High/Critical audit gate;
- targeted Multer remediation to 2.4.0;
- no blind force-upgrade policy.

Known tooling-only item:

- current full backend audit reports a High advisory in `deepmerge-ts` through
  `@prisma/config`; that lock path is `devOptional` Prisma CLI/tooling and is
  excluded from the required production-runtime gate.
- it remains a maintenance item for a future compatible Prisma/tooling upgrade.

### Availability

Controls:

- per-phone OTP cooldown;
- OTP attempt limits;
- request validation;
- bounded fixed-weekday department input;
- atomic persistence paths.

Residual risks:

- source-level OTP/SMS pumping;
- no formal production backup/restore exercise yet;
- no documented recovery objectives yet.

### Repudiation / auditability

Current controls:

- immutable/minimized `AuditLog` foundation exists for critical administrative mutations;
- ShiftChangeRequestEvent records actor/event transitions;
- publication and managed-rule histories provide immutable version evidence;
- live PostgreSQL regression verifies AuditLog immutability.

Residual risk:

- scoped read/history API/UI for administrators is still missing (#24/#23);
- future role/private-profile mutations must add audit coverage;
- retention/deletion policy is not finalized.

## Known production blockers

The following remain blockers or explicit production-readiness gates:

- production SMS/equivalent provider;
- trusted reverse-proxy model before source-level request throttling;
- source-level OTP/SMS abuse protection;
- production backup operations: schedule, encrypted storage/provider permissions, retention,
  RTO/RPO and disaster-recovery rehearsal (CI pg_dump→restore smoke already exists);
- retention/deletion policy for security/PII records;
- completion of admin audit viewer/coverage for future role/private-data mutations;
- final secrets/deployment review;
- final repeat Critical/High security audit.

## Verification map

Already automated:

- OTP verification concurrency;
- OTP request-code same-phone concurrency on live PostgreSQL;
- DB-backed source-level OTP request limiting;
- session persistence/revocation on live PostgreSQL;
- department IDOR/scope on live PostgreSQL;
- HTTP/CORS/origin/security headers;
- browser account cache isolation;
- failed logout local purge;
- onboarding stale-scope/race protections;
- shift-change stale-scope protections and atomic SWAP/COVER application on live PostgreSQL;
- immutable AuditLog regression;
- pg_dump→isolated restore smoke in Backend CI;
- runtime dependency High/Critical gate.

Still requiring production/manual validation:

- production TLS/cookie/origin deployment;
- actual SMS provider behavior and abuse controls;
- trusted proxy / source identity;
- production backup storage/schedule/RTO/RPO and disaster-recovery rehearsal;
- retention/audit operational process;
- final browser acceptance for privacy/export/print/account switching.

## Change rule

When a new feature adds:

- a new data class;
- a new external provider;
- a new privileged role/permission;
- a new browser persistence mechanism;
- a new bulk mutation;
- a new export/report;
- a new deployment boundary;

this threat model must be reviewed and extended in the same delivery cycle.
