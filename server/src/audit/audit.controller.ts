import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { auditPageResponse } from '../openapi.responses';
import { AuditQueryInput, AuditService } from './audit.service';

@ApiTags('audit')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'AUDIT_READ capability is required.' })
@ApiBadRequestResponse({ description: 'Invalid audit filter or pagination query.' })
@Controller('audit-events')
@UseGuards(SessionAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @ApiOperation({ summary: 'Read a paginated privacy-minimized administrative audit journal' })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'to', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, schema: auditPageResponse })
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AuditQueryInput,
  ) {
    return this.audit.list(user, query ?? {});
  }
}
