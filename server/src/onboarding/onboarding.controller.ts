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

@Controller('onboarding')
@UseGuards(SessionAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('departments')
  listDepartments(@CurrentUser() user: AuthUserContext) {
    return this.onboarding.listDepartments(user);
  }

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

  @Get('status')
  getStatus(@CurrentUser() user: AuthUserContext) {
    return this.onboarding.getMyStatus(user);
  }

  @Post('cancel')
  cancel(@CurrentUser() user: AuthUserContext) {
    return this.onboarding.cancelMyPendingRequest(user);
  }

  @Get('admin/departments')
  listAdminDepartments(@CurrentUser() admin: AuthUserContext) {
    return this.onboarding.listAdminDepartments(admin);
  }

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

  @Post('admin/:requestId/approve')
  approve(
    @CurrentUser() admin: AuthUserContext,
    @Param('requestId') requestId: string,
  ) {
    return this.onboarding.approve(admin, requestId);
  }

  @Post('admin/:requestId/reject')
  reject(
    @CurrentUser() admin: AuthUserContext,
    @Param('requestId') requestId: string,
  ) {
    return this.onboarding.reject(admin, requestId);
  }
}
