# Pilot data retention policy

This document defines the internal MVP pilot retention policy for Work time departments. It is an operational product policy, not a statement of statutory retention requirements. Legal or customer-specific requirements may require stricter rules before a public rollout.

## Scope

The pilot currently stores account phone numbers, OTP challenges, auth sessions, work schedules, publications, acknowledgements, absences, shift-change history, notifications, wishes, onboarding requests and audit records. Address/avatar/taxi private-profile fields are not part of the MVP pilot.

## Retention rules

| Data | Pilot rule | Enforcement |
| --- | --- | --- |
| AuthChallenge / OTP | Keep only for `max(OTP_TTL, AUTH_OTP_SOURCE_WINDOW_SECONDS)` | Opportunistic physical cleanup before request-code decisions |
| AuthSession | Keep only while usable; expired or revoked sessions may be physically deleted immediately | Opportunistic cleanup during authentication traffic |
| Notification | 180 days from creation | Opportunistic cleanup before inbox/unread reads |
| NotificationPreference | Keep while the account exists | Account lifecycle |
| User.phoneE164 | Keep while the account is active or still referenced by retained work/audit history | Manual account-erasure review; no automatic anonymization in pilot |
| Membership / Employee | Keep while required for current access and retained work history | Soft-deactivation for access removal |
| ShiftChangeRequest + events | Keep for the pilot and retained schedule history | Business history; no automatic deletion in MVP |
| Absence including canceled/SICK | Keep for the pilot and retained schedule history; SICK free text is prohibited | Business history; no automatic deletion in MVP |
| Schedule / Shift / Publication / Acknowledgement | Keep for the pilot and retained schedule history | Published history remains immutable outside explicit retention mode |
| AuditLog | Keep for the pilot and retained work history | Immutable outside explicit retention mode |
| EmployeeWish | Explicit manager deletion is available; otherwise keep for the relevant planning history | Existing delete flow |
| OnboardingRequest | Keep for account/access traceability during pilot | No automatic deletion in MVP |
| Backup copies | Must expire on the configured backup rotation and must not outlive the approved operational retention without review | Production backup schedule/rotation |

## Deactivation and deletion

Deactivation removes current access; it does not silently rewrite published schedule history, acknowledgements or audit evidence. Account-level erasure is therefore a controlled operation, not an automatic cascade.

Before any manual erasure:
1. revoke sessions and memberships;
2. remove or anonymize private/account identifiers only where doing so does not break required work-history integrity;
3. use explicit retention mode for immutable tables only under an approved maintenance procedure;
4. allow old encrypted backups to age out according to the configured rotation instead of rewriting historical backup files in place.

## Sensitive free text

Do not enter medical diagnoses, home addresses, phone numbers, passport data or other private details into EmployeeWish, absence comments, publication comments or other work notes. SICK absences reject free-text comments in code.

## Pilot review

Before a public rollout, repeat the privacy review against the actual deployment, provider logs, exported files, backup storage and any new private-profile/taxi fields.
