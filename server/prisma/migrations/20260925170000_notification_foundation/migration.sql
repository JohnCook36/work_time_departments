-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM (
  'SHIFT_CHANGE',
  'SCHEDULE_PUBLICATION',
  'TASK',
  'SCHEDULE_RULE',
  'SYSTEM'
);

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM (
  'SHIFT_CHANGE_REQUEST',
  'SCHEDULE_PUBLICATION',
  'TASK',
  'SCHEDULE_RULE',
  'SYSTEM'
);

-- CreateTable
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "entityType" "NotificationEntityType" NOT NULL,
  "entityId" TEXT,
  "eventKey" VARCHAR(180) NOT NULL,
  "critical" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_recipientId_eventKey_key"
ON "Notification"("recipientId", "eventKey");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx"
ON "Notification"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_category_createdAt_idx"
ON "Notification"("category", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key"
ON "NotificationPreference"("userId", "category");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx"
ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference"
ADD CONSTRAINT "NotificationPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
