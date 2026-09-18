-- CreateEnum
CREATE TYPE "OnboardingRequestType" AS ENUM ('LINK_EXISTING', 'CREATE_EMPLOYEE');

-- CreateEnum
CREATE TYPE "OnboardingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateTable
CREATE TABLE "OnboardingRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "OnboardingRequestType" NOT NULL,
    "status" "OnboardingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "departmentId" TEXT NOT NULL,
    "employeeId" TEXT,
    "requestedDisplayName" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingRequest_userId_status_idx"
ON "OnboardingRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "OnboardingRequest_departmentId_status_idx"
ON "OnboardingRequest"("departmentId", "status");

-- CreateIndex
CREATE INDEX "OnboardingRequest_employeeId_idx"
ON "OnboardingRequest"("employeeId");

-- CreateIndex
CREATE INDEX "OnboardingRequest_reviewedByUserId_idx"
ON "OnboardingRequest"("reviewedByUserId");

-- AddForeignKey
ALTER TABLE "OnboardingRequest"
ADD CONSTRAINT "OnboardingRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingRequest"
ADD CONSTRAINT "OnboardingRequest_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingRequest"
ADD CONSTRAINT "OnboardingRequest_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingRequest"
ADD CONSTRAINT "OnboardingRequest_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
