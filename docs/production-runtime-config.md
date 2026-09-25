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

Backend production configuration remains separate and still requires the canonical auth/runtime values documented by the release gate, including production `FRONTEND_ORIGIN`, TLS/reverse-proxy settings, secrets and a real OTP delivery provider. This frontend guard does not replace those checks.
