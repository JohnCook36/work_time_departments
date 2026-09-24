import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SchedulePublicationsService } from './schedule-publications.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [AuthModule],
  controllers: [SchedulesController],
  providers: [SchedulesService, SchedulePublicationsService],
})
export class SchedulesModule {}
