import { ApiTags, ApiOperation, ApiResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiSecurity, ApiConflictResponse, ApiNotFoundResponse, ApiBody } from '@nestjs/swagger';
import { arrayOf, shiftChangeResponse } from '../openapi.responses';
import { CreateShiftChangeRequestDto } from './shift-change-requests.dto';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ShiftChangeRequestKind } from '@prisma/client';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ShiftChangeRequestsService } from './shift-change-requests.service';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(field + ' is required');
  }

  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return requiredString(value, field);
}

function requestKind(value: unknown): ShiftChangeRequestKind {
  if (
    value !== ShiftChangeRequestKind.SWAP &&
    value !== ShiftChangeRequestKind.COVER
  ) {
    throw new BadRequestException('kind must be SWAP or COVER');
  }

  return value;
}

@ApiTags('shift-change-requests')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'Insufficient role, department scope or employee ownership.' })
@ApiBadRequestResponse({ description: 'Invalid request data.' })
@ApiNotFoundResponse({ description: 'Requested active resource not found.' })
@ApiConflictResponse({ description: 'Stale version, invalid state transition or conflicting active dependencies.' })
@Controller('shift-change-requests')
@UseGuards(SessionAuthGuard)
export class ShiftChangeRequestsController {
  constructor(private readonly requests: ShiftChangeRequestsService) {}

  @ApiOperation({ summary: 'Create SWAP or COVER request for persisted shifts; starts at PENDING_TARGET' })
  @ApiBody({ type: CreateShiftChangeRequestDto })
  @ApiResponse({ status: 201, schema: shiftChangeResponse })
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body()
    body: {
      kind?: unknown;
      targetEmployeeId?: unknown;
      requesterShiftId?: unknown;
      targetShiftId?: unknown;
    },
  ) {
    return this.requests.create(user, {
      kind: requestKind(body?.kind),
      targetEmployeeId: requiredString(
        body?.targetEmployeeId,
        'targetEmployeeId',
      ),
      requesterShiftId: requiredString(
        body?.requesterShiftId,
        'requesterShiftId',
      ),
      targetShiftId: optionalString(body?.targetShiftId, 'targetShiftId'),
    });
  }

  @ApiOperation({ summary: 'Read requests made by the authenticated linked employee' })
  @ApiResponse({ status: 200, schema: arrayOf(shiftChangeResponse) })
  @Get('mine')
  getMine(@CurrentUser() user: AuthUserContext) {
    return this.requests.getMine(user);
  }

  @ApiOperation({ summary: 'Read requests addressed to the authenticated linked employee' })
  @ApiResponse({ status: 200, schema: arrayOf(shiftChangeResponse) })
  @Get('incoming')
  getIncoming(@CurrentUser() user: AuthUserContext) {
    return this.requests.getIncoming(user);
  }

  @ApiOperation({ summary: 'Target accepts: PENDING_TARGET to PENDING_MANAGER; changed source shift becomes STALE with 409' })
  @ApiResponse({ status: 201, schema: shiftChangeResponse })
  @Post(':id/accept')
  accept(
    @CurrentUser() user: AuthUserContext,
    @Param('id') requestId: string,
  ) {
    return this.requests.accept(user, requestId);
  }

  @ApiOperation({ summary: 'Target rejects: PENDING_TARGET to TARGET_REJECTED' })
  @ApiResponse({ status: 201, schema: shiftChangeResponse })
  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthUserContext,
    @Param('id') requestId: string,
  ) {
    return this.requests.reject(user, requestId);
  }

  @ApiOperation({ summary: 'Requester cancels PENDING_TARGET or PENDING_MANAGER request' })
  @ApiResponse({ status: 201, schema: shiftChangeResponse })
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUserContext,
    @Param('id') requestId: string,
  ) {
    return this.requests.cancel(user, requestId);
  }

  @ApiOperation({ summary: 'Read PENDING_MANAGER requests within scope of both departments' })
  @ApiResponse({ status: 200, schema: arrayOf(shiftChangeResponse) })
  @Get('admin/pending')
  getPendingForAdmin(@CurrentUser() admin: AuthUserContext) {
    return this.requests.getPendingForAdmin(admin);
  }

  @ApiOperation({ summary: 'Manager approves: PENDING_MANAGER to MANAGER_APPROVED; does not mutate Shift. Changed source shift becomes STALE with 409' })
  @ApiResponse({ status: 201, schema: shiftChangeResponse })
  @Post(':id/admin/approve')
  approve(
    @CurrentUser() admin: AuthUserContext,
    @Param('id') requestId: string,
  ) {
    return this.requests.approve(admin, requestId);
  }

  @ApiOperation({ summary: 'Manager rejects: PENDING_MANAGER to MANAGER_REJECTED; requires scope over both departments' })
  @ApiResponse({ status: 201, schema: shiftChangeResponse })
  @Post(':id/admin/reject')
  managerReject(
    @CurrentUser() admin: AuthUserContext,
    @Param('id') requestId: string,
  ) {
    return this.requests.managerReject(admin, requestId);
  }
}
