import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  attendanceQrResponse,
  workSessionListResponse,
  workSessionResponse,
} from '../openapi.responses';
import { AttendanceService } from './attendance.service';

@ApiTags('attendance')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing session or invalid/expired QR.' })
@ApiForbiddenResponse({ description: 'Inactive employee or insufficient department capability.' })
@ApiBadRequestResponse({ description: 'Invalid attendance input.' })
@ApiConflictResponse({ description: 'Duplicate, stale or conflicting session.' })
@Controller('attendance')
@UseGuards(SessionAuthGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @ApiOperation({ summary: 'Issue a short-lived multi-employee QR for a managed department; kiosk provisioning is separate' })
  @ApiBody({ schema: { type: 'object', required: ['departmentId'], properties: { departmentId: { type: 'string' } } } })
  @ApiResponse({ status: 201, schema: attendanceQrResponse })
  @Post('qr')
  issueQr(@CurrentUser() user: AuthUserContext, @Body() body: Record<string, unknown>) {
    return this.attendance.issueQr(user, body?.departmentId);
  }

  @ApiOperation({ summary: 'Check in the currently linked employee using server time and a valid QR' })
  @ApiBody({ schema: { type: 'object', required: ['token'], properties: { token: { type: 'string', writeOnly: true } } } })
  @ApiResponse({ status: 201, schema: workSessionResponse })
  @Post('check-in')
  checkIn(@CurrentUser() user: AuthUserContext, @Body() body: Record<string, unknown>) {
    return this.attendance.checkIn(user, body?.token);
  }

  @ApiOperation({ summary: 'Check out the currently linked employee using a new valid QR and server time' })
  @ApiBody({ schema: { type: 'object', required: ['token'], properties: { token: { type: 'string', writeOnly: true } } } })
  @ApiResponse({ status: 201, schema: workSessionResponse })
  @Post('check-out')
  checkOut(@CurrentUser() user: AuthUserContext, @Body() body: Record<string, unknown>) {
    return this.attendance.checkOut(user, body?.token);
  }

  @ApiOperation({ summary: 'Read only the authenticated employee work sessions in a bounded date range' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiResponse({ status: 200, schema: workSessionListResponse })
  @Get('me')
  mine(@CurrentUser() user: AuthUserContext, @Query('from') from?: string, @Query('to') to?: string) {
    return this.attendance.mine(user, from, to);
  }

  @ApiOperation({ summary: 'Read work sessions only in an authorized department' })
  @ApiQuery({ name: 'departmentId', required: true })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiResponse({ status: 200, schema: workSessionListResponse })
  @Get('department')
  department(
    @CurrentUser() user: AuthUserContext,
    @Query('departmentId') departmentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.department(user, departmentId, from, to);
  }

  @ApiOperation({ summary: 'Create a missing closed work session with correction capability and audit trail' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['employeeId', 'checkInAt', 'checkOutAt', 'reason'],
      properties: {
        employeeId: { type: 'string' },
        checkInAt: { type: 'string', format: 'date-time' },
        checkOutAt: { type: 'string', format: 'date-time' },
        reason: { type: 'string', maxLength: 240 },
      },
    },
  })
  @ApiResponse({ status: 201, schema: workSessionResponse })
  @Post('corrections')
  createCorrection(@CurrentUser() user: AuthUserContext, @Body() body: Record<string, unknown>) {
    return this.attendance.createCorrection(user, body);
  }

  @ApiOperation({ summary: 'Correct work session timestamps with optimistic locking and immutable event/audit' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['checkInAt', 'checkOutAt', 'expectedUpdatedAt', 'reason'],
      properties: {
        checkInAt: { type: 'string', format: 'date-time' },
        checkOutAt: { type: 'string', format: 'date-time', nullable: true },
        expectedUpdatedAt: { type: 'string', format: 'date-time' },
        reason: { type: 'string', maxLength: 240 },
      },
    },
  })
  @ApiResponse({ status: 200, schema: workSessionResponse })
  @Patch('sessions/:sessionId')
  correct(
    @CurrentUser() user: AuthUserContext,
    @Param('sessionId') sessionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.attendance.correct(user, sessionId, body);
  }
}
