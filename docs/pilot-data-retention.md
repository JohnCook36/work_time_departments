# Pilot data retention policy

This policy applies to the limited MVP pilot. It is not a general legal retention schedule and must be reviewed before broader production rollout.

## Principles

- Collect only data required by the current pilot.
- Do not add address, avatar, medical free text, or other private-profile fields before their post-MVP privacy boundary is implemented.
- Work-history records that protect schedule integrity may be retained for the pilot; technical authentication records should not accumulate indefinitely.
- Production backups must expire consistently with live-data retention once #25 is configured.
- Real personal data must not be copied into GitHub, Notion, logs, examples, or test fixtures.

## Current pilot decisions

| Data | Pilot retention decision | Deletion / deactivation behavior |
| --- | --- | --- |
| `AuthChallenge` | Technical-only. Keep only while needed for OTP validity / source rate limiting: `max(OTP_TTL, AUTH_OTP_SOURCE_WINDOW_SECONDS)`. | Stale rows are pruned before new request-code decisions. Exact wall-clock deletion during completely idle auth requires an operational scheduler using the same rule. |
| `AuthSession` | No business-history value after it is invalid. | Expired or revoked sessions are pruned before a fresh session is created. Logout and account deactivation invalidate access immediately. Exact wall-clock cleanup during zero login traffic is an operational follow-up, not a reason to retain indefinitely. |
| `User.phoneE164` | Keep for the lifetime of the pilot account because it is the account identifier and may be required to preserve account/history linkage. | Inactive accounts cannot authenticate. Automatic anonymization is intentionally not performed in the pilot because it would break identity/history semantics. Account-erasure/anonymization is a post-pilot policy decision before broader rollout. |
| `Notification` / preferences | Keep as user-scoped operational history for the active pilot. Do not put phone, OTP, medical free text, or private-profile values in notification payloads. | Access remains recipient-scoped. A production-wide notification expiry window must be chosen before GA if the service continues beyond the controlled pilot. |
| `Absence`, including canceled `SICK` | Keep as schedule/work history during the pilot. `SICK` stores type/date only and rejects free-text medical details. | Cancel marks the record canceled and removes scheduling effect; it does not erase work-history evidence. |
| Schedule / Shift / Publication / Acknowledgement / Audit / Shift-change history | Keep for the pilot because these records support schedule integrity, acknowledgement, accountability and incident investigation. | Do not blanket-delete immutable history. Any later erasure procedure must preserve referential and audit integrity. |
| Employee wishes / onboarding history | Keep only as current work-planning / onboarding history during the pilot; do not enter medical, contact or other sensitive details into free text. | Existing explicit wish deletion remains available. A broader lifecycle policy is deferred until after pilot usage is observed. |
| Excel / print exports | Treat as transient operator copies, not the authoritative archive. | Store only where operationally needed and remove after handoff/printing according to the hotel's local operating procedure. |
| Backups | Follow live-data policy, but physical expiry depends on #25 production backup configuration. | #25 must define encrypted storage, least-privilege access, rotation, retention, RPO/RTO and restore rehearsal before Gate A opens. |

## Pilot acceptance boundary

The current pilot privacy boundary is acceptable only while the app does **not** collect the post-MVP private-profile fields (address/avatar/private contacts/taxi address). Introducing those fields before pilot requires reopening #27/#41.

Before broader production/GA, the owner must revisit:
- account erasure/anonymization;
- exact notification retention;
- exact inactive-account retention;
- operational scheduled cleanup when auth traffic is idle;
- backup expiry alignment;
- any statutory or contractual retention requirements applicable to the deployment jurisdiction.
