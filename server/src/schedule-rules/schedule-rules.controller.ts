import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  arrayOf,
  scheduleRuleDeletedResponse,
  scheduleRuleFoPresetResponse,
  scheduleRuleHistoryResponse,
  scheduleRuleResponse,
} from '../openapi.responses';
import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  CreateScheduleRuleDto,
  DeleteScheduleRuleDto,
  UpdateScheduleRuleDto,
} from './schedule-rules.dto';
import {
  ScheduleRuleMutationInput,
  ScheduleRulesService,
} from './schedule-rules.service';

@ApiTags('schedule-rules')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'Insufficient rule-management scope.' })
@ApiBadRequestResponse({ description: 'Invalid rule definition.' })
@ApiNotFoundResponse({ description: 'Schedule rule not found.' })
@ApiConflictResponse({ description: 'Stale optimistic version.' })
@Controller('schedule-rules')
@UseGuards(SessionAuthGuard)
export class ScheduleRulesController {
  constructor(private readonly rules: ScheduleRulesService) {}

  @ApiOperation({ summary: 'List visible managed schedule rules' })
  @ApiResponse({ status: 200, schema: arrayOf(scheduleRuleResponse) })
  @Get('manageable')
  listManageable(@CurrentUser() user: AuthUserContext) {
    return this.rules.listManageable(user);
  }

  @ApiOperation({ summary: 'Idempotently add standard FO coverage rules to one FO department' })
  @ApiResponse({ status: 201, schema: scheduleRuleFoPresetResponse })
  @Post('presets/fo/:departmentId')
  applyFoPreset(
    @CurrentUser() user: AuthUserContext,
    @Param('departmentId') departmentId: string,
  ) {
    return this.rules.applyFoPreset(user, departmentId);
  }

  @ApiOperation({ summary: 'Create a managed schedule rule' })
  @ApiBody({ type: CreateScheduleRuleDto })
  @ApiResponse({ status: 201, schema: scheduleRuleResponse })
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() body: ScheduleRuleMutationInput,
  ) {
    return this.rules.createRule(user, body ?? {});
  }

  @ApiOperation({ summary: 'Update, enable or disable a managed schedule rule' })
  @ApiBody({ type: UpdateScheduleRuleDto })
  @ApiResponse({ status: 200, schema: scheduleRuleResponse })
  @Patch(':ruleId')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('ruleId') ruleId: string,
    @Body()
    body: ScheduleRuleMutationInput & { expectedUpdatedAt?: unknown },
  ) {
    return this.rules.updateRule(user, ruleId, body ?? {});
  }

  @ApiOperation({ summary: 'Soft-delete a managed schedule rule' })
  @ApiBody({ type: DeleteScheduleRuleDto })
  @ApiResponse({ status: 200, schema: scheduleRuleDeletedResponse })
  @Delete(':ruleId')
  remove(
    @CurrentUser() user: AuthUserContext,
    @Param('ruleId') ruleId: string,
    @Body() body: { expectedUpdatedAt?: unknown },
  ) {
    return this.rules.deleteRule(user, ruleId, body?.expectedUpdatedAt);
  }

  @ApiOperation({ summary: 'Read immutable version history for a schedule rule' })
  @ApiResponse({ status: 200, schema: scheduleRuleHistoryResponse })
  @Get(':ruleId/history')
  history(
    @CurrentUser() user: AuthUserContext,
    @Param('ruleId') ruleId: string,
  ) {
    return this.rules.getHistory(user, ruleId);
  }
}
