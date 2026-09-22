import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  ScheduleCellChange,
  SchedulesService,
} from './schedules.service';

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

function requiredBodyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(field + ' is required');
  }

  return value.trim();
}

function requiredBodyInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BadRequestException(field + ' must be an integer');
  }

  return value;
}

function requiredChanges(value: unknown): ScheduleCellChange[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('changes must be an array');
  }

  return value as ScheduleCellChange[];
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

  @Patch('manageable/entries')
  applyManageableScheduleChanges(
    @CurrentUser() user: AuthUserContext,
    @Body()
    body: {
      year?: unknown;
      month?: unknown;
      changes?: unknown;
    },
  ) {
    return this.schedules.applyManageableScheduleChanges(
      user,
      requiredBodyInteger(body?.year, 'year'),
      requiredBodyInteger(body?.month, 'month'),
      requiredChanges(body?.changes),
    );
  }

  @Patch('department/entries')
  applyDepartmentScheduleChanges(
    @CurrentUser() user: AuthUserContext,
    @Body()
    body: {
      departmentId?: unknown;
      year?: unknown;
      month?: unknown;
      changes?: unknown;
    },
  ) {
    return this.schedules.applyDepartmentScheduleChanges(
      user,
      requiredBodyString(body?.departmentId, 'departmentId'),
      requiredBodyInteger(body?.year, 'year'),
      requiredBodyInteger(body?.month, 'month'),
      requiredChanges(body?.changes),
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
