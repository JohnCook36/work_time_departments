import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScheduleAcknowledgementsService } from './schedule-acknowledgements.service';
import { SchedulePublicationsService } from './schedule-publications.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [SchedulesController],
  providers: [SchedulesService, SchedulePublicationsService, ScheduleAcknowledgementsService],
})
export class SchedulesModule {}
