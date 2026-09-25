CREATE TYPE "PermissionCapability" AS ENUM (
  'SCHEDULE_READ',
  'SCHEDULE_EDIT',
  'SCHEDULE_PUBLISH',
  'EMPLOYEE_MANAGE',
  'ONBOARDING_REVIEW',
  'SHIFT_CHANGE_APPROVE',
  'SCHEDULE_RULE_MANAGE',
  'AUDIT_READ',
  'PRIVATE_PROFILE_READ',
  'PRIVATE_PROFILE_EDIT',
  'ROLE_MANAGE'
);

CREATE TABLE "MembershipPermission" (
  "id" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "capability" "PermissionCapability" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MembershipPermission_membershipId_capability_key"
ON "MembershipPermission"("membershipId", "capability");

CREATE INDEX "MembershipPermission_capability_idx"
ON "MembershipPermission"("capability");

ALTER TABLE "MembershipPermission"
ADD CONSTRAINT "MembershipPermission_membershipId_fkey"
FOREIGN KEY ("membershipId")
REFERENCES "Membership"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
