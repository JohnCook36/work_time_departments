ALTER TYPE "PermissionCapability" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORK_SESSION_CORRECTED';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'WORK_SESSION';

CREATE TYPE "WorkSessionSource" AS ENUM ('QR', 'MANUAL');
CREATE TYPE "WorkSessionEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'CORRECTED');

CREATE TABLE "WorkSession" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "source" "WorkSessionSource" NOT NULL,
  "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkSession_order_check" CHECK ("checkOutAt" IS NULL OR "checkOutAt" > "checkInAt")
);

CREATE TABLE "WorkSessionEvent" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "type" "WorkSessionEventType" NOT NULL,
  "oldCheckInAt" TIMESTAMP(3),
  "oldCheckOutAt" TIMESTAMP(3),
  "checkInAt" TIMESTAMP(3) NOT NULL,
  "checkOutAt" TIMESTAMP(3),
  "qrTokenHash" VARCHAR(64),
  "reason" VARCHAR(240),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkSessionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkSession_employeeId_checkInAt_idx" ON "WorkSession"("employeeId", "checkInAt");
CREATE INDEX "WorkSession_departmentId_checkInAt_idx" ON "WorkSession"("departmentId", "checkInAt");
CREATE UNIQUE INDEX "WorkSession_one_open_per_employee" ON "WorkSession"("employeeId")
  WHERE "checkOutAt" IS NULL;
CREATE UNIQUE INDEX "WorkSessionEvent_employeeId_qrTokenHash_key"
  ON "WorkSessionEvent"("employeeId", "qrTokenHash");
CREATE INDEX "WorkSessionEvent_sessionId_createdAt_idx"
  ON "WorkSessionEvent"("sessionId", "createdAt");
CREATE INDEX "WorkSessionEvent_actorUserId_idx" ON "WorkSessionEvent"("actorUserId");

ALTER TABLE "WorkSession"
  ADD CONSTRAINT "WorkSession_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkSession"
  ADD CONSTRAINT "WorkSession_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkSessionEvent"
  ADD CONSTRAINT "WorkSessionEvent_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkSessionEvent"
  ADD CONSTRAINT "WorkSessionEvent_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkSessionEvent"
  ADD CONSTRAINT "WorkSessionEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_work_session_event_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'WorkSessionEvent records are immutable';
  END IF;
  IF TG_OP = 'DELETE'
     AND current_setting('wtd.attendance_retention_delete', true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION 'WorkSessionEvent deletion requires retention mode';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkSessionEvent_immutable"
BEFORE UPDATE OR DELETE ON "WorkSessionEvent"
FOR EACH ROW
EXECUTE FUNCTION prevent_work_session_event_mutation();
