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

@Controller('shift-change-requests')
@UseGuards(SessionAuthGuard)
export class ShiftChangeRequestsController {
  constructor(private readonly requests: ShiftChangeRequestsService) {}

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

  @Get('mine')
  getMine(@CurrentUser() user: AuthUserContext) {
    return this.requests.getMine(user);
  }

  @Get('incoming')
  getIncoming(@CurrentUser() user: AuthUserContext) {
    return this.requests.getIncoming(user);
  }

  @Post(':id/accept')
  accept(
    @CurrentUser() user: AuthUserContext,
    @Param('id') requestId: string,
  ) {
    return this.requests.accept(user, requestId);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthUserContext,
    @Param('id') requestId: string,
  ) {
    return this.requests.reject(user, requestId);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUserContext,
    @Param('id') requestId: string,
  ) {
    return this.requests.cancel(user, requestId);
  }

  @Get('admin/pending')
  getPendingForAdmin(@CurrentUser() admin: AuthUserContext) {
    return this.requests.getPendingForAdmin(admin);
  }

  @Post(':id/admin/approve')
  approve(
    @CurrentUser() admin: AuthUserContext,
    @Param('id') requestId: string,
  ) {
    return this.requests.approve(admin, requestId);
  }

  @Post(':id/admin/reject')
  managerReject(
    @CurrentUser() admin: AuthUserContext,
    @Param('id') requestId: string,
  ) {
    return this.requests.managerReject(admin, requestId);
  }
}
