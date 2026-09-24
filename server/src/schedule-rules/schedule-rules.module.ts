import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ScheduleRulesController } from './schedule-rules.controller';
import { ScheduleRulesService } from './schedule-rules.service';

@Module({
  imports: [AuthModule],
  controllers: [ScheduleRulesController],
  providers: [ScheduleRulesService],
  exports: [ScheduleRulesService],
})
export class ScheduleRulesModule {}
