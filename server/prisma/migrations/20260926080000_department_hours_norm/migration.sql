ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DEPARTMENT_HOURS_NORM_UPSERTED';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'DEPARTMENT_HOURS_NORM';

CREATE TABLE "DepartmentHoursNorm" (
  "id" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "fullTimeHours" DOUBLE PRECISION NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DepartmentHoursNorm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentHoursNorm_departmentId_year_month_key"
  ON "DepartmentHoursNorm"("departmentId", "year", "month");
CREATE INDEX "DepartmentHoursNorm_year_month_idx"
  ON "DepartmentHoursNorm"("year", "month");
CREATE INDEX "DepartmentHoursNorm_createdByUserId_idx"
  ON "DepartmentHoursNorm"("createdByUserId");
CREATE INDEX "DepartmentHoursNorm_updatedByUserId_idx"
  ON "DepartmentHoursNorm"("updatedByUserId");

ALTER TABLE "DepartmentHoursNorm"
  ADD CONSTRAINT "DepartmentHoursNorm_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DepartmentHoursNorm"
  ADD CONSTRAINT "DepartmentHoursNorm_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DepartmentHoursNorm"
  ADD CONSTRAINT "DepartmentHoursNorm_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
