-- CreateEnum
CREATE TYPE "ShiftChangeRequestKind" AS ENUM ('SWAP', 'COVER');

-- CreateEnum
CREATE TYPE "ShiftChangeRequestStatus" AS ENUM (
    'PENDING_TARGET',
    'PENDING_MANAGER',
    'TARGET_REJECTED',
    'MANAGER_APPROVED',
    'MANAGER_REJECTED',
    'CANCELED',
    'STALE'
);

-- CreateEnum
CREATE TYPE "ShiftChangeRequestEventType" AS ENUM (
    'CREATED',
    'TARGET_ACCEPTED',
    'TARGET_REJECTED',
    'CANCELED',
    'MANAGER_APPROVED',
    'MANAGER_REJECTED',
    'MARKED_STALE'
);

-- CreateTable
CREATE TABLE "ShiftChangeRequest" (
    "id" TEXT NOT NULL,
    "kind" "ShiftChangeRequestKind" NOT NULL,
    "status" "ShiftChangeRequestStatus" NOT NULL DEFAULT 'PENDING_TARGET',
    "requesterUserId" TEXT NOT NULL,
    "requesterEmployeeId" TEXT NOT NULL,
    "requesterDepartmentId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetEmployeeId" TEXT NOT NULL,
    "targetDepartmentId" TEXT NOT NULL,
    "requesterShiftId" TEXT NOT NULL,
    "targetShiftId" TEXT,
    "requesterShiftUpdatedAt" TIMESTAMP(3) NOT NULL,
    "targetShiftUpdatedAt" TIMESTAMP(3),
    "managerUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftChangeRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "eventType" "ShiftChangeRequestEventType" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftChangeRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftChangeRequest_requesterUserId_createdAt_idx"
ON "ShiftChangeRequest"("requesterUserId", "createdAt");

CREATE INDEX "ShiftChangeRequest_targetUserId_createdAt_idx"
ON "ShiftChangeRequest"("targetUserId", "createdAt");

CREATE INDEX "ShiftChangeRequest_status_createdAt_idx"
ON "ShiftChangeRequest"("status", "createdAt");

CREATE INDEX "ShiftChangeRequest_requesterDepartmentId_status_idx"
ON "ShiftChangeRequest"("requesterDepartmentId", "status");

CREATE INDEX "ShiftChangeRequest_targetDepartmentId_status_idx"
ON "ShiftChangeRequest"("targetDepartmentId", "status");

CREATE INDEX "ShiftChangeRequest_requesterShiftId_idx"
ON "ShiftChangeRequest"("requesterShiftId");

CREATE INDEX "ShiftChangeRequest_targetShiftId_idx"
ON "ShiftChangeRequest"("targetShiftId");

CREATE INDEX "ShiftChangeRequest_managerUserId_idx"
ON "ShiftChangeRequest"("managerUserId");

CREATE INDEX "ShiftChangeRequestEvent_requestId_createdAt_idx"
ON "ShiftChangeRequestEvent"("requestId", "createdAt");

CREATE INDEX "ShiftChangeRequestEvent_actorUserId_idx"
ON "ShiftChangeRequestEvent"("actorUserId");

CREATE INDEX "ShiftChangeRequestEvent_eventType_idx"
ON "ShiftChangeRequestEvent"("eventType");

-- AddForeignKey
ALTER TABLE "ShiftChangeRequest"
ADD CONSTRAINT "ShiftChangeRequest_requesterUserId_fkey"
FOREIGN KEY ("requesterUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftChangeRequest"
ADD CONSTRAINT "ShiftChangeRequest_requesterEmployeeId_fkey"
FOREIGN KEY ("requesterEmployeeId") REFERENCES "Employee"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftChangeRequest"
ADD CONSTRAINT "ShiftChangeRequest_requesterDepartmentId_fkey"
FOREIGN KEY ("requesterDepartmentId") REFERENCES "Department"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftChangeRequest"
ADD CONSTRAINT "ShiftChangeRequest_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftChangeRequest"
ADD CONSTRAINT "ShiftChangeRequest_targetEmployeeId_fkey"
FOREIGN KEY ("targetEmployeeId") REFERENCES "Employee"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftChangeRequest"
ADD CONSTRAINT "ShiftChangeRequest_targetDepartmentId_fkey"
FOREIGN KEY ("targetDepartmentId") REFERENCES "Department"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftChangeRequest"
ADD CONSTRAINT "ShiftChangeRequest_requesterShiftId_fkey"
FOREIGN KEY ("requesterShiftId") REFERENCES "Shift"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftChangeRequest"
ADD CONSTRAINT "ShiftChangeRequest_targetShiftId_fkey"
FOREIGN KEY ("targetShiftId") REFERENCES "Shift"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftChangeRequest"
ADD CONSTRAINT "ShiftChangeRequest_managerUserId_fkey"
FOREIGN KEY ("managerUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftChangeRequestEvent"
ADD CONSTRAINT "ShiftChangeRequestEvent_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "ShiftChangeRequest"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftChangeRequestEvent"
ADD CONSTRAINT "ShiftChangeRequestEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
