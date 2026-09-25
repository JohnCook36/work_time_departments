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
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  arrayOf,
  membershipAssignmentResponse,
  membershipDeactivatedResponse,
} from '../openapi.responses';
import {
  CreateMembershipAssignmentDto,
  DeactivateMembershipDto,
  ReplaceMembershipPermissionsDto,
} from './memberships.dto';
import {
  CreateMembershipAssignmentInput,
  DeactivateMembershipInput,
  MembershipsService,
  ReplaceMembershipPermissionsInput,
} from './memberships.service';

@ApiTags('memberships')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'Insufficient role-management scope.' })
@ApiBadRequestResponse({ description: 'Invalid role, scope or capability assignment.' })
@ApiConflictResponse({ description: 'Duplicate, stale or self-lockout assignment.' })
@Controller('memberships')
@UseGuards(SessionAuthGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @ApiOperation({ summary: 'List active assignments in a manageable scope' })
  @ApiQuery({
    name: 'departmentId',
    required: false,
    schema: { type: 'string' },
    description: 'Omit only for SUPER_ADMIN global assignments.',
  })
  @ApiResponse({ status: 200, schema: arrayOf(membershipAssignmentResponse) })
  @Get('manageable')
  listManageable(
    @CurrentUser() user: AuthUserContext,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.memberships.listManageable(user, departmentId);
  }

  @ApiOperation({ summary: 'Create a scoped role assignment for a linked employee' })
  @ApiBody({ type: CreateMembershipAssignmentDto })
  @ApiResponse({ status: 201, schema: membershipAssignmentResponse })
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() body: CreateMembershipAssignmentInput,
  ) {
    return this.memberships.createAssignment(user, body ?? {});
  }

  @ApiOperation({ summary: 'Replace explicit DEPUTY capabilities atomically' })
  @ApiBody({ type: ReplaceMembershipPermissionsDto })
  @ApiResponse({ status: 200, schema: membershipAssignmentResponse })
  @Patch(':membershipId/permissions')
  replacePermissions(
    @CurrentUser() user: AuthUserContext,
    @Param('membershipId') membershipId: string,
    @Body() body: ReplaceMembershipPermissionsInput,
  ) {
    return this.memberships.replacePermissions(user, membershipId, body ?? {});
  }

  @ApiOperation({ summary: 'Soft-deactivate a role assignment' })
  @ApiBody({ type: DeactivateMembershipDto })
  @ApiResponse({ status: 200, schema: membershipDeactivatedResponse })
  @Patch(':membershipId/deactivate')
  deactivate(
    @CurrentUser() user: AuthUserContext,
    @Param('membershipId') membershipId: string,
    @Body() body: DeactivateMembershipInput,
  ) {
    return this.memberships.deactivate(user, membershipId, body ?? {});
  }
}
