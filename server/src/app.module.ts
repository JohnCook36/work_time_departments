import { Module } from '@nestjs/common';

import { DepartmentsModule } from './departments/departments.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulesModule } from './schedules/schedules.module';
import { ShiftsModule } from './shifts/shifts.module';
import { WishesModule } from './wishes/wishes.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    DepartmentsModule,
    EmployeesModule,
    SchedulesModule,
    ShiftsModule,
    WishesModule,
  ],
})
export class AppModule {}
