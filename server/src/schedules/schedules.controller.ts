import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SchedulesService } from './schedules.service';

function requiredString(value: string | undefined, field: string): string {
  if (!value?.trim()) {
    throw new BadRequestException(field + ' is required');
  }

  return value.trim();
}

function requiredInteger(value: string | undefined, field: string): number {
  const normalized = requiredString(value, field);
  if (!/^\d+$/.test(normalized)) {
    throw new BadRequestException(field + ' must be an integer');
  }

  return Number(normalized);
}

@Controller('schedule-data')
@UseGuards(SessionAuthGuard)
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get('department')
  getDepartmentSchedule(
    @CurrentUser() user: AuthUserContext,
    @Query('departmentId') departmentId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.schedules.getDepartmentSchedule(
      user,
      requiredString(departmentId, 'departmentId'),
      requiredInteger(year, 'year'),
      requiredInteger(month, 'month'),
    );
  }

  @Get('me')
  getMySchedule(
    @CurrentUser() user: AuthUserContext,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.schedules.getMySchedule(
      user,
      requiredInteger(year, 'year'),
      requiredInteger(month, 'month'),
    );
  }
}
