import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ManagementInsightsController } from './management-insights.controller';
import { ManagementInsightsService } from './management-insights.service';

@Module({
  imports: [AuthModule],
  controllers: [ManagementInsightsController],
  providers: [ManagementInsightsService],
})
export class ManagementInsightsModule {}
