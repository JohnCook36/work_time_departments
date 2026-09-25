-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('VACATION', 'SICK', 'TRAINING', 'BUSINESS_TRIP', 'UNAVAILABLE');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ABSENCE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ABSENCE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ABSENCE_CANCELED';

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE 'ABSENCE';

-- CreateTable
CREATE TABLE "Absence" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "type" "AbsenceType" NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "comment" VARCHAR(240),
  "canceledAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Absence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Absence_date_range_check" CHECK ("endDate" >= "startDate")
);

-- CreateIndex
CREATE INDEX "Absence_employeeId_startDate_endDate_idx"
ON "Absence"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Absence_employeeId_canceledAt_idx"
ON "Absence"("employeeId", "canceledAt");

-- AddForeignKey
ALTER TABLE "Absence"
ADD CONSTRAINT "Absence_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence"
ADD CONSTRAINT "Absence_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence"
ADD CONSTRAINT "Absence_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
