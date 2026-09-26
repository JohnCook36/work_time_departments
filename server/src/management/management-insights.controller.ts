import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  managementHoursNormResponse,
  managementHoursResponse,
  managementTodayResponse,
} from '../openapi.responses';
import { ManagementInsightsService } from './management-insights.service';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(field + ' is required');
  }
  return value.trim();
}

function requiredInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new BadRequestException(field + ' must be an integer');
  }
  return parsed;
}

@ApiTags('management')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'Management scope is required.' })
@ApiBadRequestResponse({ description: 'Invalid management query.' })
@Controller('management')
@UseGuards(SessionAuthGuard)
export class ManagementInsightsController {
  constructor(private readonly insights: ManagementInsightsService) {}

  @ApiOperation({ summary: 'Read current-day management projection from published schedule, absences and pending shift requests' })
  @ApiQuery({ name: 'date', required: true })
  @ApiResponse({ status: 200, schema: managementTodayResponse })
  @Get('today')
  today(
    @CurrentUser() user: AuthUserContext,
    @Query('date') date?: string,
  ) {
    return this.insights.today(user, requiredString(date, 'date'));
  }

  @ApiOperation({ summary: 'Create or update one department full-time norm for a month' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['departmentId', 'year', 'month', 'fullTimeHours'],
      properties: {
        departmentId: { type: 'string' },
        year: { type: 'integer' },
        month: { type: 'integer' },
        fullTimeHours: { type: 'number', minimum: 0, maximum: 400 },
      },
    },
  })
  @ApiResponse({ status: 200, schema: managementHoursNormResponse })
  @Put('hours/norm')
  upsertHoursNorm(
    @CurrentUser() user: AuthUserContext,
    @Body()
    body: {
      departmentId?: unknown;
      year?: unknown;
      month?: unknown;
      fullTimeHours?: unknown;
    },
  ) {
    const fullTimeHours = Number(body?.fullTimeHours);
    if (!Number.isFinite(fullTimeHours)) {
      throw new BadRequestException('fullTimeHours must be a number');
    }
    return this.insights.upsertHoursNorm(
      user,
      requiredString(body?.departmentId, 'departmentId'),
      requiredInteger(body?.year, 'year'),
      requiredInteger(body?.month, 'month'),
      fullTimeHours,
    );
  }

  @ApiOperation({ summary: 'Read planned-hours management analytics for scoped departments' })
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'month', required: true })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiResponse({ status: 200, schema: managementHoursResponse })
  @Get('hours')
  hours(
    @CurrentUser() user: AuthUserContext,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.insights.hours(
      user,
      requiredInteger(year, 'year'),
      requiredInteger(month, 'month'),
      departmentId?.trim() || undefined,
    );
  }
}
