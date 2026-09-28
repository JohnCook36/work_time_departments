import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ManagementInsightsController } from './management-insights.controller';
import { ManagementInsightsService } from './management-insights.service';
import { PlanActualController } from './plan-actual.controller';
import { PlanActualService } from './plan-actual.service';

@Module({
  imports: [AuthModule],
  controllers: [ManagementInsightsController, PlanActualController],
  providers: [ManagementInsightsService, PlanActualService],
})
export class ManagementInsightsModule {}
