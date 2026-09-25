import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { absenceCanceledResponse, absenceListResponse, absenceResponse } from '../openapi.responses';
import type { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AbsencesService } from './absences.service';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(field + ' is required');
  }
  return value.trim();
}

@ApiTags('absences')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'Insufficient department scope.' })
@ApiBadRequestResponse({ description: 'Invalid absence data.' })
@ApiConflictResponse({ description: 'Stale or duplicate absence.' })
@Controller('absences')
@UseGuards(SessionAuthGuard)
export class AbsencesController {
  constructor(private readonly absences: AbsencesService) {}

  @ApiOperation({ summary: 'List structured absences in a managed department' })
  @ApiQuery({ name: 'departmentId', required: true })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiResponse({ status: 200, schema: absenceListResponse })
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query('departmentId') departmentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.absences.listDepartment(
      user,
      requiredString(departmentId, 'departmentId'),
      from,
      to,
    );
  }

  @ApiOperation({ summary: 'Create structured absence for a managed employee' })
  @ApiResponse({ status: 201, schema: absenceResponse })
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.absences.create(user, body);
  }

  @ApiOperation({ summary: 'Edit active structured absence with optimistic locking' })
  @ApiResponse({ status: 200, schema: absenceResponse })
  @Patch(':absenceId')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('absenceId') absenceId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.absences.update(
      user,
      requiredString(absenceId, 'absenceId'),
      body,
    );
  }

  @ApiOperation({ summary: 'Soft-cancel structured absence' })
  @ApiResponse({ status: 201, schema: absenceCanceledResponse })
  @Post(':absenceId/cancel')
  cancel(
    @CurrentUser() user: AuthUserContext,
    @Param('absenceId') absenceId: string,
    @Body() body: { expectedUpdatedAt?: unknown },
  ) {
    return this.absences.cancel(
      user,
      requiredString(absenceId, 'absenceId'),
      requiredString(body?.expectedUpdatedAt, 'expectedUpdatedAt'),
    );
  }
}
