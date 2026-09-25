import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchedulePublicationsService } from './schedule-publications.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [SchedulesController],
  providers: [SchedulesService, SchedulePublicationsService],
})
export class SchedulesModule {}
