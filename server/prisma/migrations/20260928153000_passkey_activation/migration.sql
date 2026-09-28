-- Passkey-first account activation. Existing phone/OTP accounts remain valid.
ALTER TABLE "User"
  ALTER COLUMN "phoneE164" DROP NOT NULL,
  ADD COLUMN "webauthnUserHandle" BYTEA;

CREATE UNIQUE INDEX "User_webauthnUserHandle_key"
  ON "User"("webauthnUserHandle");

CREATE TYPE "ActivationInvitationPurpose" AS ENUM ('ACTIVATION', 'RECOVERY');
CREATE TYPE "WebAuthnChallengeType" AS ENUM ('REGISTER', 'AUTHENTICATE');

ALTER TYPE "AuditAction" ADD VALUE 'ACTIVATION_INVITATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSKEY_REGISTERED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSKEY_CREDENTIALS_RESET';

CREATE TABLE "ActivationInvitation" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "purpose" "ActivationInvitationPurpose" NOT NULL DEFAULT 'ACTIVATION',
  "tokenHash" VARCHAR(64) NOT NULL,
  "shortCodeHash" VARCHAR(64) NOT NULL,
  "userHandle" BYTEA NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivationInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasskeyCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" VARCHAR(512) NOT NULL,
  "publicKey" BYTEA NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebAuthnChallenge" (
  "id" TEXT NOT NULL,
  "challengeHash" VARCHAR(64) NOT NULL,
  "type" "WebAuthnChallengeType" NOT NULL,
  "userId" TEXT,
  "invitationId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActivationInvitation_tokenHash_key"
  ON "ActivationInvitation"("tokenHash");
CREATE UNIQUE INDEX "ActivationInvitation_shortCodeHash_key"
  ON "ActivationInvitation"("shortCodeHash");
CREATE UNIQUE INDEX "ActivationInvitation_userHandle_key"
  ON "ActivationInvitation"("userHandle");
CREATE INDEX "ActivationInvitation_employeeId_createdAt_idx"
  ON "ActivationInvitation"("employeeId", "createdAt");
CREATE INDEX "ActivationInvitation_createdByUserId_createdAt_idx"
  ON "ActivationInvitation"("createdByUserId", "createdAt");
CREATE INDEX "ActivationInvitation_expiresAt_idx"
  ON "ActivationInvitation"("expiresAt");
CREATE UNIQUE INDEX "ActivationInvitation_one_active_employee_idx"
  ON "ActivationInvitation"("employeeId")
  WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "PasskeyCredential_credentialId_key"
  ON "PasskeyCredential"("credentialId");
CREATE INDEX "PasskeyCredential_userId_revokedAt_idx"
  ON "PasskeyCredential"("userId", "revokedAt");

CREATE UNIQUE INDEX "WebAuthnChallenge_challengeHash_key"
  ON "WebAuthnChallenge"("challengeHash");
CREATE INDEX "WebAuthnChallenge_userId_type_createdAt_idx"
  ON "WebAuthnChallenge"("userId", "type", "createdAt");
CREATE INDEX "WebAuthnChallenge_invitationId_type_createdAt_idx"
  ON "WebAuthnChallenge"("invitationId", "type", "createdAt");
CREATE INDEX "WebAuthnChallenge_expiresAt_idx"
  ON "WebAuthnChallenge"("expiresAt");

ALTER TABLE "ActivationInvitation"
  ADD CONSTRAINT "ActivationInvitation_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActivationInvitation"
  ADD CONSTRAINT "ActivationInvitation_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PasskeyCredential"
  ADD CONSTRAINT "PasskeyCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebAuthnChallenge"
  ADD CONSTRAINT "WebAuthnChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebAuthnChallenge"
  ADD CONSTRAINT "WebAuthnChallenge_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "ActivationInvitation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
