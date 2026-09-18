import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthModule } from './health/health.module';
import { MembershipsModule } from './memberships/memberships.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulesModule } from './schedules/schedules.module';
import { ShiftsModule } from './shifts/shifts.module';
import { UsersModule } from './users/users.module';
import { WishesModule } from './wishes/wishes.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    DepartmentsModule,
    EmployeesModule,
    UsersModule,
    MembershipsModule,
    SchedulesModule,
    ShiftsModule,
    WishesModule,
  ],
})
export class AppModule {}
