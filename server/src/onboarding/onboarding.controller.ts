import { ApiTags, ApiOperation, ApiResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiSecurity, ApiConflictResponse, ApiNotFoundResponse, ApiBody, ApiQuery } from '@nestjs/swagger';
import { arrayOf, departmentSummaryResponse, employeeSummaryResponse, onboardingApprovedResponse, onboardingPendingResponse, onboardingResponse, onboardingStatusResponse } from '../openapi.responses';
import { LinkEmployeeDto, RegisterEmployeeDto } from './onboarding.dto';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { OnboardingService } from './onboarding.service';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(field + ' is required');
  }

  return value.trim();
}

@ApiTags('onboarding')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'Insufficient role, department scope or employee ownership.' })
@ApiBadRequestResponse({ description: 'Invalid request data.' })
@ApiNotFoundResponse({ description: 'Requested active resource not found.' })
@ApiConflictResponse({ description: 'Stale version, invalid state transition or conflicting active dependencies.' })
@Controller('onboarding')
@UseGuards(SessionAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @ApiOperation({ summary: 'List active departments for an unlinked account' })
  @ApiResponse({ status: 200, schema: arrayOf(departmentSummaryResponse) })
  @Get('departments')
  listDepartments(@CurrentUser() user: AuthUserContext) {
    return this.onboarding.listDepartments(user);
  }

  @ApiOperation({ summary: 'Find up to ten unlinked employee candidates; query requires at least three characters' })
  @ApiResponse({ status: 200, schema: arrayOf(employeeSummaryResponse) })
  @ApiQuery({ name: 'departmentId', required: true, schema: { type: 'string' } })
  @ApiQuery({ name: 'query', required: true, schema: { type: 'string' } })
  @Get('candidates')
  findCandidates(
    @CurrentUser() user: AuthUserContext,
    @Query('departmentId') departmentId?: string,
    @Query('query') query?: string,
  ) {
    return this.onboarding.findCandidates(
      user,
      requiredString(departmentId, 'departmentId'),
      requiredString(query, 'query'),
    );
  }

  @ApiOperation({ summary: 'Request manager approval to link an existing employee' })
  @ApiBody({ type: LinkEmployeeDto })
  @ApiResponse({ status: 201, schema: onboardingResponse })
  @Post('link-request')
  requestLink(
    @CurrentUser() user: AuthUserContext,
    @Body() body: { employeeId?: unknown },
  ) {
    return this.onboarding.requestExistingEmployeeLink(
      user,
      requiredString(body?.employeeId, 'employeeId'),
    );
  }

  @ApiOperation({ summary: 'Request manager approval to create and link an employee' })
  @ApiBody({ type: RegisterEmployeeDto })
  @ApiResponse({ status: 201, schema: onboardingResponse })
  @Post('registration-request')
  requestRegistration(
    @CurrentUser() user: AuthUserContext,
    @Body() body: { displayName?: unknown; departmentId?: unknown },
  ) {
    return this.onboarding.requestNewEmployeeRegistration(
      user,
      requiredString(body?.displayName, 'displayName'),
      requiredString(body?.departmentId, 'departmentId'),
    );
  }

  @ApiOperation({ summary: 'Read the latest onboarding request, or null' })
  @ApiResponse({ status: 200, schema: onboardingStatusResponse })
  @Get('status')
  getStatus(@CurrentUser() user: AuthUserContext) {
    return this.onboarding.getMyStatus(user);
  }

  @ApiOperation({ summary: 'Cancel the current pending request' })
  @ApiResponse({ status: 201, schema: onboardingResponse })
  @Post('cancel')
  cancel(@CurrentUser() user: AuthUserContext) {
    return this.onboarding.cancelMyPendingRequest(user);
  }

  @ApiOperation({ summary: 'List departments the current manager can review' })
  @ApiResponse({ status: 200, schema: arrayOf(departmentSummaryResponse) })
  @Get('admin/departments')
  listAdminDepartments(@CurrentUser() admin: AuthUserContext) {
    return this.onboarding.listAdminDepartments(admin);
  }

  @ApiOperation({ summary: 'List pending requests in a managed department' })
  @ApiResponse({ status: 200, schema: arrayOf(onboardingPendingResponse) })
  @ApiQuery({ name: 'departmentId', required: true, schema: { type: 'string' } })
  @Get('admin/pending')
  listPending(
    @CurrentUser() admin: AuthUserContext,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.onboarding.listPendingForDepartment(
      admin,
      requiredString(departmentId, 'departmentId'),
    );
  }

  @ApiOperation({ summary: 'Approve a pending request in a managed department' })
  @ApiResponse({ status: 201, schema: onboardingApprovedResponse })
  @Post('admin/:requestId/approve')
  approve(
    @CurrentUser() admin: AuthUserContext,
    @Param('requestId') requestId: string,
  ) {
    return this.onboarding.approve(admin, requestId);
  }

  @ApiOperation({ summary: 'Reject a pending request in a managed department' })
  @ApiResponse({ status: 201, schema: onboardingResponse })
  @Post('admin/:requestId/reject')
  reject(
    @CurrentUser() admin: AuthUserContext,
    @Param('requestId') requestId: string,
  ) {
    return this.onboarding.reject(admin, requestId);
  }
}
