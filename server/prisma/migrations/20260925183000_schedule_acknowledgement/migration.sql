-- CreateTable
CREATE TABLE "ScheduleAcknowledgement" (
  "id" TEXT NOT NULL,
  "publicationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "acknowledgedByUserId" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScheduleAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleAcknowledgement_publicationId_employeeId_key"
ON "ScheduleAcknowledgement"("publicationId", "employeeId");

-- CreateIndex
CREATE INDEX "ScheduleAcknowledgement_publicationId_acknowledgedAt_idx"
ON "ScheduleAcknowledgement"("publicationId", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "ScheduleAcknowledgement_employeeId_acknowledgedAt_idx"
ON "ScheduleAcknowledgement"("employeeId", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "ScheduleAcknowledgement_acknowledgedByUserId_acknowledgedAt_idx"
ON "ScheduleAcknowledgement"("acknowledgedByUserId", "acknowledgedAt");

-- AddForeignKey
ALTER TABLE "ScheduleAcknowledgement"
ADD CONSTRAINT "ScheduleAcknowledgement_publicationId_fkey"
FOREIGN KEY ("publicationId") REFERENCES "SchedulePublication"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAcknowledgement"
ADD CONSTRAINT "ScheduleAcknowledgement_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAcknowledgement"
ADD CONSTRAINT "ScheduleAcknowledgement_acknowledgedByUserId_fkey"
FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
