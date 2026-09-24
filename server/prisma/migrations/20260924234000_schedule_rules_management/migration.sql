ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHEDULE_RULE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHEDULE_RULE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHEDULE_RULE_DELETED';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'SCHEDULE_RULE';

CREATE TYPE "ScheduleRuleScope" AS ENUM (
  'ORGANIZATION',
  'DEPARTMENT',
  'ROLE',
  'SHIFT_TYPE'
);

CREATE TYPE "ScheduleRuleSeverity" AS ENUM (
  'HARD',
  'SOFT'
);

CREATE TYPE "ScheduleRuleKind" AS ENUM (
  'MAX_CONCURRENT_EMPLOYEES',
  'MIN_STAFF_AT_TIME'
);

ALTER TABLE "SchedulePublication"
ADD COLUMN "rulesSnapshot" JSONB;

CREATE TABLE "ScheduleRule" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "ScheduleRuleKind" NOT NULL,
    "scope" "ScheduleRuleScope" NOT NULL,
    "scopeValue" VARCHAR(64),
    "departmentId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "severity" "ScheduleRuleSeverity" NOT NULL DEFAULT 'HARD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "violationMessage" VARCHAR(500) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleRuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduleRule_scope_isActive_isDeleted_idx"
ON "ScheduleRule"("scope", "isActive", "isDeleted");

CREATE INDEX "ScheduleRule_departmentId_isActive_isDeleted_idx"
ON "ScheduleRule"("departmentId", "isActive", "isDeleted");

CREATE INDEX "ScheduleRule_kind_isActive_isDeleted_idx"
ON "ScheduleRule"("kind", "isActive", "isDeleted");

CREATE INDEX "ScheduleRule_priority_idx"
ON "ScheduleRule"("priority");

CREATE UNIQUE INDEX "ScheduleRuleVersion_ruleId_version_key"
ON "ScheduleRuleVersion"("ruleId", "version");

CREATE INDEX "ScheduleRuleVersion_ruleId_createdAt_idx"
ON "ScheduleRuleVersion"("ruleId", "createdAt");

CREATE INDEX "ScheduleRuleVersion_changedByUserId_createdAt_idx"
ON "ScheduleRuleVersion"("changedByUserId", "createdAt");

ALTER TABLE "ScheduleRule"
ADD CONSTRAINT "ScheduleRule_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScheduleRule"
ADD CONSTRAINT "ScheduleRule_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScheduleRule"
ADD CONSTRAINT "ScheduleRule_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScheduleRuleVersion"
ADD CONSTRAINT "ScheduleRuleVersion_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "ScheduleRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScheduleRuleVersion"
ADD CONSTRAINT "ScheduleRuleVersion_changedByUserId_fkey"
FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_schedule_rule_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.schedule_rule_retention_mode', true) = 'on'
     AND TG_OP = 'DELETE'
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Schedule rule versions are immutable';
END;
$$;

CREATE TRIGGER "ScheduleRuleVersion_immutable"
BEFORE UPDATE OR DELETE ON "ScheduleRuleVersion"
FOR EACH ROW
EXECUTE FUNCTION prevent_schedule_rule_version_mutation();
