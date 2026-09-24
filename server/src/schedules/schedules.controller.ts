import { ApiTags, ApiOperation, ApiResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiSecurity, ApiConflictResponse, ApiNotFoundResponse, ApiBody, ApiQuery } from '@nestjs/swagger';
import { departmentScheduleResponse, personalScheduleResponse, scheduleAppliedResponse, schedulePublicationListResponse, schedulePublicationResponse, schedulePublicationValidationResponse } from '../openapi.responses';
import { ApplyPlannerChangesDto, ApplyDepartmentChangesDto, MaterializeFixedWeekdaysDto, PublishDepartmentScheduleDto } from './schedules.dto';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SchedulePublicationsService } from './schedule-publications.service';
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

function optionalBodyString(
  value: unknown,
  field: string,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException(field + ' must be a string');
  }
  return value;
}

function requiredChanges(value: unknown): ScheduleCellChange[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('changes must be an array');
  }

  return value as ScheduleCellChange[];
}

@ApiTags('schedules')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'Insufficient role, department scope or employee ownership.' })
@ApiBadRequestResponse({ description: 'Invalid request data.' })
@ApiNotFoundResponse({ description: 'Requested active resource not found.' })
@ApiConflictResponse({ description: 'Stale version, invalid state transition or conflicting active dependencies.' })
@Controller('schedule-data')
@UseGuards(SessionAuthGuard)
export class SchedulesController {
  constructor(
    private readonly schedules: SchedulesService,
    private readonly publications: SchedulePublicationsService,
  ) {}

  @ApiOperation({ summary: 'Save missing fixed-weekday shifts for a month from today (UTC); existing cells remain unchanged' })
  @ApiBody({ type: MaterializeFixedWeekdaysDto })
  @ApiResponse({ status: 201, schema: { type: 'object', properties: { status: { type: 'string' }, created: { type: 'integer' } } } })
  @Post('planner/fixed-weekdays')
  materializeFixedWeekdays(
    @CurrentUser() user: AuthUserContext,
    @Body() body: { year?: unknown; month?: unknown; departmentIds?: unknown },
  ) {
    return this.schedules.materializeFixedWeekdays(
      user,
      requiredBodyInteger(body?.year, 'year'),
      requiredBodyInteger(body?.month, 'month'),
      body?.departmentIds as string[],
    );
  }

  @ApiOperation({ summary: 'Read persisted schedule for a managed department' })
  @ApiResponse({ status: 200, schema: departmentScheduleResponse })
  @ApiQuery({ name: 'departmentId', required: true, schema: { type: 'string' } })
  @ApiQuery({ name: 'year', required: true, schema: { type: 'integer', minimum: 1970, maximum: 9999 } })
  @ApiQuery({ name: 'month', required: true, schema: { type: 'integer', minimum: 1, maximum: 12 } })
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

  @ApiOperation({ summary: 'Atomically write cells across departments; requires management scope for every affected department' })
  @ApiBody({ type: ApplyPlannerChangesDto })
  @ApiResponse({ status: 200, schema: scheduleAppliedResponse })
  @Patch('planner/entries')
  applyPlannerScheduleChanges(
    @CurrentUser() user: AuthUserContext,
    @Body()
    body: {
      year?: unknown;
      month?: unknown;
      changes?: unknown;
    },
  ) {
    return this.schedules.applyPlannerScheduleChanges(
      user,
      requiredBodyInteger(body?.year, 'year'),
      requiredBodyInteger(body?.month, 'month'),
      requiredChanges(body?.changes),
    );
  }

  @ApiOperation({ summary: 'Write one or more cells atomically within a managed department' })
  @ApiBody({ type: ApplyDepartmentChangesDto })
  @ApiResponse({ status: 200, schema: scheduleAppliedResponse })
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

  @ApiOperation({ summary: 'Validate the current department draft before publication' })
  @ApiResponse({ status: 200, schema: schedulePublicationValidationResponse })
  @ApiQuery({ name: 'departmentId', required: true, schema: { type: 'string' } })
  @ApiQuery({ name: 'year', required: true, schema: { type: 'integer', minimum: 1970, maximum: 9999 } })
  @ApiQuery({ name: 'month', required: true, schema: { type: 'integer', minimum: 1, maximum: 12 } })
  @Get('department/validation')
  validateDepartmentSchedule(
    @CurrentUser() user: AuthUserContext,
    @Query('departmentId') departmentId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.publications.validateDepartmentSchedule(
      user,
      requiredString(departmentId, 'departmentId'),
      requiredInteger(year, 'year'),
      requiredInteger(month, 'month'),
    );
  }

  @ApiOperation({ summary: 'Publish an immutable department schedule version from the current draft' })
  @ApiBody({ type: PublishDepartmentScheduleDto })
  @ApiResponse({ status: 201, schema: schedulePublicationResponse })
  @Post('department/publish')
  publishDepartmentSchedule(
    @CurrentUser() user: AuthUserContext,
    @Body()
    body: {
      departmentId?: unknown;
      year?: unknown;
      month?: unknown;
      comment?: unknown;
    },
  ) {
    return this.publications.publishDepartmentSchedule(
      user,
      requiredBodyString(body?.departmentId, 'departmentId'),
      requiredBodyInteger(body?.year, 'year'),
      requiredBodyInteger(body?.month, 'month'),
      optionalBodyString(body?.comment, 'comment'),
    );
  }

  @ApiOperation({ summary: 'List immutable published versions for a managed department and month' })
  @ApiResponse({ status: 200, schema: schedulePublicationListResponse })
  @ApiQuery({ name: 'departmentId', required: true, schema: { type: 'string' } })
  @ApiQuery({ name: 'year', required: true, schema: { type: 'integer', minimum: 1970, maximum: 9999 } })
  @ApiQuery({ name: 'month', required: true, schema: { type: 'integer', minimum: 1, maximum: 12 } })
  @Get('department/publications')
  listDepartmentPublications(
    @CurrentUser() user: AuthUserContext,
    @Query('departmentId') departmentId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.publications.listDepartmentPublications(
      user,
      requiredString(departmentId, 'departmentId'),
      requiredInteger(year, 'year'),
      requiredInteger(month, 'month'),
    );
  }

  @ApiOperation({ summary: 'Read one immutable published department schedule version' })
  @ApiResponse({ status: 200, schema: schedulePublicationResponse })
  @ApiQuery({ name: 'departmentId', required: true, schema: { type: 'string' } })
  @ApiQuery({ name: 'year', required: true, schema: { type: 'integer', minimum: 1970, maximum: 9999 } })
  @ApiQuery({ name: 'month', required: true, schema: { type: 'integer', minimum: 1, maximum: 12 } })
  @ApiQuery({ name: 'version', required: true, schema: { type: 'integer', minimum: 1 } })
  @Get('department/publication')
  getDepartmentPublication(
    @CurrentUser() user: AuthUserContext,
    @Query('departmentId') departmentId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('version') version?: string,
  ) {
    return this.publications.getDepartmentPublication(
      user,
      requiredString(departmentId, 'departmentId'),
      requiredInteger(year, 'year'),
      requiredInteger(month, 'month'),
      requiredInteger(version, 'version'),
    );
  }

  @ApiOperation({ summary: 'Read only the authenticated linked employee schedule' })
  @ApiResponse({ status: 200, schema: personalScheduleResponse })
  @ApiQuery({ name: 'year', required: true, schema: { type: 'integer', minimum: 1970, maximum: 9999 } })
  @ApiQuery({ name: 'month', required: true, schema: { type: 'integer', minimum: 1, maximum: 12 } })
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
