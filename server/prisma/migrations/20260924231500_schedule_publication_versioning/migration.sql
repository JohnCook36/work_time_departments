ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHEDULE_PUBLISHED';

CREATE TABLE "SchedulePublication" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publishedByUserId" TEXT NOT NULL,
    "sourceScheduleUpdatedAt" TIMESTAMP(3) NOT NULL,
    "comment" VARCHAR(500),
    "rulesVersion" VARCHAR(100),
    "snapshot" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulePublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchedulePublication_scheduleId_departmentId_version_key"
ON "SchedulePublication"("scheduleId", "departmentId", "version");

CREATE INDEX "SchedulePublication_scheduleId_departmentId_createdAt_idx"
ON "SchedulePublication"("scheduleId", "departmentId", "createdAt");

CREATE INDEX "SchedulePublication_publishedByUserId_createdAt_idx"
ON "SchedulePublication"("publishedByUserId", "createdAt");

ALTER TABLE "SchedulePublication"
ADD CONSTRAINT "SchedulePublication_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SchedulePublication"
ADD CONSTRAINT "SchedulePublication_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SchedulePublication"
ADD CONSTRAINT "SchedulePublication_publishedByUserId_fkey"
FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_schedule_publication_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.schedule_publication_retention_mode', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Published schedule versions are immutable';
END;
$$;

CREATE TRIGGER "SchedulePublication_immutable"
BEFORE UPDATE OR DELETE ON "SchedulePublication"
FOR EACH ROW
EXECUTE FUNCTION prevent_schedule_publication_mutation();
