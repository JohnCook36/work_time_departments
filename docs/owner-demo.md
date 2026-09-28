# Owner demo package

This runbook creates a **synthetic-only** hotel Front Office scenario for the owner/GM demo. It must never be used against production data.

## Safety boundary

The seed refuses to run unless all of the following are true:

- `NODE_ENV` is not `production`;
- `DEMO_SEED_CONFIRM=SYNTHETIC_DEMO_ONLY`;
- `DATABASE_URL` points to a PostgreSQL database whose database name contains `demo` or `test`;
- `BUSINESS_TIME_ZONE` is configured explicitly.

Use a dedicated disposable demo database. For a full reset, recreate that database and run Prisma migrations again. Do not point the seed at a copied production database.

The demo identities use only reserved synthetic data:

- manager: `+12025550101`;
- employee A: `+12025550102`;
- employee B: `+12025550103`;
- employee C: `+12025550104`;
- display names are prefixed with `Демо`.

No real employee details should be added to this seed, fixtures, screenshots, recordings or documentation.

## Create the demo dataset

From `server/`:

```bash
export DATABASE_URL='postgresql://.../work_time_departments_demo'
export BUSINESS_TIME_ZONE='Europe/Moscow'
export DEMO_SEED_CONFIRM='SYNTHETIC_DEMO_ONLY'
npm run prisma:generate
npx prisma migrate deploy
npm run demo:seed
```

For a local non-production login flow, keep the existing explicit development OTP guard:

```bash
export NODE_ENV='development'
export AUTH_ALLOW_DEV_OTP='true'
export AUTH_DEV_OTP_CODE='123456'
export AUTH_OTP_PEPPER='replace-with-a-local-secret-at-least-32-characters'
```

Do not enable the development OTP path in production.

## Seeded scenario

The seed is idempotent for the dedicated demo database and creates:

- one Front Office department;
- one department manager and three employees;
- a current-month schedule;
- published shifts for today plus a pending next-day swap request;
- one training absence;
- two completed manual WorkSessions:
  - employee A arrives 12 minutes late and leaves 20 minutes early;
  - employee B follows the planned start and stays 20 minutes longer;
- one immutable SchedulePublication snapshot.

The published snapshot is the plan source for Plan / Fact. WorkSession is the actual source. Payable time remains unavailable until separate business rules are approved.

## 5–10 minute owner / GM demo flow

1. **Login as the demo manager.**
   Show that authentication enters a server-backed management account rather than a local-only planner.

2. **Today.**
   Open `/today`. Explain the single operational screen: published shifts, attendance state, absence and pending manager request.

3. **Plan / Fact.**
   Open `/plan-actual`. Show the late/early employee and the employee with extra actual time. Emphasize that scheduled, actual and payable are different semantics.

4. **Team hours.**
   Open `/team-hours`. Show planned hours versus the configured norm. This is scheduled workload, not attendance/payroll.

5. **Planner and validation.**
   Open `/planner`. Show the published schedule context, managed validation/risk explanation and the schedule editing workflow. Do not mutate the published snapshot to explain historical Plan / Fact.

6. **Shift request.**
   Open the shift request management flow. The seed contains one request waiting for manager action for the next day.

7. **Employee view.**
   Sign in as one of the synthetic employees and show personal published schedule / acknowledgement / request surfaces as applicable.

8. **Close with the data model.**
   State explicitly:
   - publication = reproducible plan;
   - WorkSession = actual attendance;
   - corrections are audited;
   - QR attendance is supported;
   - no real personal data is present in the demo dataset.

## Acceptance

Before an owner demo:

- current `main` CI, Backend CI and Playwright are green;
- desktop 1440×900 and mobile 390×844 routes have no page overflow;
- demo database is synthetic/disposable;
- no production credentials or real PII are used;
- all demo routes are reachable through application navigation;
- Gate A pilot readiness is evaluated separately: this demo package does not substitute for production OTP, backup/restore or final deployed security evidence.
