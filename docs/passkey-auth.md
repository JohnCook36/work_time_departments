# Passkey activation and recovery

Passkey/WebAuthn is the canonical MVP authentication mechanism for Work Time Departments.

## Normal employee activation

1. A manager creates or selects an Employee.
2. From the employee card, the manager chooses **Выдать приглашение**.
3. Backend creates a 20-minute one-time invitation.
4. The manager gives the employee either:
   - the locally rendered QR containing the activation URL; or
   - the fallback one-time code.
5. The employee confirms the displayed Employee/department and registers a Passkey.
6. The invitation and WebAuthn challenge are consumed atomically.
7. Backend links User ↔ Employee, creates the EMPLOYEE membership and a 90-day HttpOnly session.

The QR is rendered inside the WTD frontend. The activation URL is not sent to a third-party QR/image service.

## Normal login

The login screen requests a discoverable WebAuthn credential. Face ID, Touch ID, Windows Hello, Android screen lock or another compatible authenticator performs user verification.

A normal reboot, browser restart, phone update or temporary loss of connectivity does not revoke the server session. A fresh manager invitation is not required for ordinary re-login while at least one active Passkey remains.

## Recovery

For an ordinary employee, a scoped manager can choose **Сбросить доступ и выдать приглашение**.

Recovery atomically:
- revokes active Passkeys;
- revokes active server sessions;
- preserves the same WebAuthn user handle;
- creates a fresh one-time recovery invitation;
- writes an audit event.

A department manager cannot reset another management account. Resetting another management account requires Super Admin. Self-reset through the manager action is forbidden.

## Initial management bootstrap

A brand-new deployment may contain a management User/Employee created before any Passkey exists. Because normal invitation issuance itself requires an authenticated manager, use the server-shell bootstrap exactly once for that account:

```bash
cd server
export AUTH_BOOTSTRAP_CONFIRM=INITIAL_PASSKEY_BOOTSTRAP
npm run auth:bootstrap-passkey -- <employee-id>
```

The target must:
- be an active linked Employee/User;
- have active management access;
- have zero active Passkeys.

The command revokes old sessions, prints one 20-minute recovery token/code once and refuses accounts that already have an active Passkey. Transfer the secret directly to the intended manager and clear terminal/shell history afterwards.

Do not expose this command through HTTP and do not use it as routine recovery.

## Production configuration

Required:

```bash
WEBAUTHN_RP_ID=work.example.com
WEBAUTHN_ORIGIN=https://work.example.com
WEBAUTHN_RP_NAME='Work Time Departments'
```

`WEBAUTHN_RP_ID` is a host/RP ID, not a URL. `WEBAUTHN_ORIGIN` is the exact frontend origin. Production origin must use HTTPS.

The existing phone OTP path remains a temporary legacy/development fallback. It is not required to close the current Passkey-based Gate A.

## Security properties

- invitation token: 256-bit random value;
- fallback code: 10 characters from an ambiguity-free alphabet;
- invitation/challenge values stored as hashes, not plaintext;
- invitation TTL: 20 minutes;
- WebAuthn challenge TTL: 5 minutes;
- user verification required;
- discoverable credential required;
- accepted credential algorithms: ES256 / RS256;
- RP ID hash, origin, ceremony type, challenge, signature and counter are verified server-side;
- credential private key never reaches WTD;
- passkey public-key material is never returned by read APIs;
- recovery and invitation issuance are management-scope checked against current DB memberships inside the transaction.
