CREATE TYPE "AuditAction" AS ENUM (
  'EMPLOYEE_DEACTIVATED',
  'DEPARTMENT_DEACTIVATED',
  'SCHEDULE_CHANGED',
  'ONBOARDING_APPROVED',
  'ONBOARDING_REJECTED',
  'SHIFT_CHANGE_MANAGER_APPROVED',
  'SHIFT_CHANGE_MANAGER_REJECTED'
);

CREATE TYPE "AuditEntityType" AS ENUM (
  'EMPLOYEE',
  'DEPARTMENT',
  'SCHEDULE',
  'ONBOARDING_REQUEST',
  'SHIFT_CHANGE_REQUEST'
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" "AuditAction" NOT NULL,
  "entityType" "AuditEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "departmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_actorUserId_createdAt_idx"
ON "AuditLog"("actorUserId", "createdAt");

CREATE INDEX "AuditLog_departmentId_createdAt_idx"
ON "AuditLog"("departmentId", "createdAt");

CREATE INDEX "AuditLog_action_createdAt_idx"
ON "AuditLog"("action", "createdAt");

CREATE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditLog records are immutable';
  END IF;

  IF TG_OP = 'DELETE'
     AND current_setting('wtd.audit_retention_delete', true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION 'AuditLog deletion requires retention mode';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_immutable"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();
