import { ApiTags, ApiOperation, ApiResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiSecurity, ApiConflictResponse, ApiNotFoundResponse, ApiBody } from '@nestjs/swagger';
import { arrayOf, departmentDeletedResponse, departmentResponse, manageableDepartmentResponse, reorderResponse } from '../openapi.responses';
import { CreateDepartmentDto, ReorderDepartmentsDto, DeactivateDepartmentDto, UpdateDepartmentDto } from './departments.dto';

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  DepartmentMutationInput,
  DepartmentReorderInput,
  DepartmentsService,
} from './departments.service';

@ApiTags('departments')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'Insufficient role, department scope or employee ownership.' })
@ApiBadRequestResponse({ description: 'Invalid request data.' })
@ApiNotFoundResponse({ description: 'Requested active resource not found.' })
@ApiConflictResponse({ description: 'Stale version, invalid state transition or conflicting active dependencies.' })
@Controller('departments')
@UseGuards(SessionAuthGuard)
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @ApiOperation({ summary: 'Create department (SUPER_ADMIN only)' })
  @ApiBody({ type: CreateDepartmentDto })
  @ApiResponse({ status: 201, schema: departmentResponse })
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() body: DepartmentMutationInput,
  ) {
    return this.departments.createDepartment(user, body ?? {});
  }

  @ApiOperation({ summary: 'Atomically reorder all active departments (SUPER_ADMIN only)' })
  @ApiBody({ type: ReorderDepartmentsDto })
  @ApiResponse({ status: 200, schema: reorderResponse })
  @Patch('reorder')
  reorder(
    @CurrentUser() user: AuthUserContext,
    @Body() body: DepartmentReorderInput,
  ) {
    return this.departments.reorderDepartments(user, body ?? {});
  }

  @ApiOperation({ summary: 'Soft-deactivate department (SUPER_ADMIN); rejects the last active department or active dependencies' })
  @ApiBody({ type: DeactivateDepartmentDto })
  @ApiResponse({ status: 200, schema: departmentDeletedResponse })
  @Patch(':departmentId/deactivate')
  deactivate(
    @CurrentUser() user: AuthUserContext,
    @Param('departmentId') departmentId: string,
    @Body() body: DepartmentMutationInput,
  ) {
    return this.departments.deactivateDepartment(
      user,
      departmentId,
      body ?? {},
    );
  }

  @ApiOperation({ summary: 'Update department (SUPER_ADMIN); at least one name/kind field required' })
  @ApiBody({ type: UpdateDepartmentDto })
  @ApiResponse({ status: 200, schema: departmentResponse })
  @Patch(':departmentId')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('departmentId') departmentId: string,
    @Body() body: DepartmentMutationInput,
  ) {
    return this.departments.updateDepartment(
      user,
      departmentId,
      body ?? {},
    );
  }

  @ApiOperation({ summary: 'List active departments within management scope' })
  @ApiResponse({ status: 200, schema: arrayOf(manageableDepartmentResponse) })
  @Get('manageable')
  listManageable(@CurrentUser() user: AuthUserContext) {
    return this.departments.listManageable(user);
  }
}
