CREATE TYPE "EmployeeScheduleMode" AS ENUM ('FLEXIBLE', 'FIXED_WEEKDAYS');

ALTER TABLE "Employee"
ADD COLUMN "scheduleMode" "EmployeeScheduleMode" NOT NULL DEFAULT 'FLEXIBLE',
ADD COLUMN "fixedStartTime" VARCHAR(5),
ADD COLUMN "fixedEndTime" VARCHAR(5);
