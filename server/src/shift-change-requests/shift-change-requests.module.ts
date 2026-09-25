import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShiftChangeRequestsController } from './shift-change-requests.controller';
import { ShiftChangeRequestsService } from './shift-change-requests.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ShiftChangeRequestsController],
  providers: [ShiftChangeRequestsService],
})
export class ShiftChangeRequestsModule {}
