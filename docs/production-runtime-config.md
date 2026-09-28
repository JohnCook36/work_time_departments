# Production frontend runtime configuration

The production web build must never silently fall back to the local demo backend or local-browser planner.

Required production frontend variables:

- `VITE_API_URL` — API base URL (for example `https://api.example.com` or a same-origin prefix such as `/api`).
- `VITE_SERVER_PLANNER_WRITE=1` — enables the canonical server-backed planner used by the pilot. Write mode also enables server reads.

Optional:

- `VITE_SERVER_PLANNER_READ=1` — useful for controlled read-only non-production environments. It is not sufficient for the production pilot because managers must be able to change the canonical schedule.

Development keeps the existing safe defaults:

- API URL defaults to `http://localhost:3000`.
- planner may remain local when the server planner flags are not enabled.

In production, missing `VITE_API_URL` or disabled server planner write causes the application to fail closed instead of rendering a localhost/local-storage mode.

## Production backend and Passkey topology

Backend production configuration is separate from the frontend build and must match the actual deployed HTTPS topology:

- `FRONTEND_ORIGIN` — the exact browser origin of the production frontend;
- `WEBAUTHN_RP_ID` — the frontend host / WebAuthn relying-party ID, without scheme or port;
- `WEBAUTHN_ORIGIN` — the exact HTTPS frontend origin used by WebAuthn ceremonies;
- `WEBAUTHN_RP_NAME` — the user-visible relying-party name;
- production database and application secrets from the deployment secret store;
- explicit reverse-proxy / trusted-proxy configuration matching the real topology.

The canonical MVP authentication flow is manager-issued one-time activation followed by Passkey/WebAuthn. A production SMS provider is **not** a Gate A requirement. Existing phone OTP remains only a legacy/development fallback and must not be enabled as a production bypass.

The current session cookie is `HttpOnly; Secure; SameSite=Lax` in production. Prefer frontend and backend on the same site (for example `work.example.com` + `api.example.com`) unless a different cookie design has been reviewed and browser-tested. A green build or deploy preview does not prove this runtime behavior.

Before Gate A is accepted, use a real HTTPS deployment and representative desktop/mobile platform authenticators to verify activation, Passkey registration, persisted session, `/auth/me`, logout, Passkey re-login and scoped recovery. Repository virtual-authenticator tests are necessary regression coverage but are not a substitute for this environment evidence.

See `docs/gate-a-pilot-acceptance.md` and `docs/gate-a-evidence-template.md` for the final acceptance record.
