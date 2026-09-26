import { Module } from '@nestjs/common';

import { AbsencesModule } from './absences/absences.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthModule } from './health/health.module';
import { MembershipsModule } from './memberships/memberships.module';
import { ManagementInsightsModule } from './management/management-insights.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulesModule } from './schedules/schedules.module';
import { ScheduleRulesModule } from './schedule-rules/schedule-rules.module';
import { ShiftsModule } from './shifts/shifts.module';
import { ShiftChangeRequestsModule } from './shift-change-requests/shift-change-requests.module';
import { UsersModule } from './users/users.module';
import { WishesModule } from './wishes/wishes.module';

@Module({
  imports: [
    PrismaModule,
    AbsencesModule,
    AuditModule,
    HealthModule,
    AuthModule,
    DepartmentsModule,
    EmployeesModule,
    UsersModule,
    MembershipsModule,
    ManagementInsightsModule,
    NotificationsModule,
    OnboardingModule,
    SchedulesModule,
    ScheduleRulesModule,
    ShiftsModule,
    ShiftChangeRequestsModule,
    WishesModule,
  ],
})
export class AppModule {}
