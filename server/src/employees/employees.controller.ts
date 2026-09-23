import { ApiTags, ApiOperation, ApiResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiSecurity, ApiConflictResponse, ApiNotFoundResponse, ApiBody, ApiQuery } from '@nestjs/swagger';
import { arrayOf, employeeDeletedResponse, employeeResponse, reorderResponse } from '../openapi.responses';
import { CreateEmployeeDto, ReorderEmployeesDto, DeactivateEmployeeDto, UpdateEmployeeDto } from './employees.dto';

import {
  BadRequestException,
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
  EmployeeMutationInput,
  EmployeeReorderInput,
  EmployeesService,
} from './employees.service';

function requiredString(value: string | undefined, field: string): string {
  if (!value?.trim()) {
    throw new BadRequestException(field + ' is required');
  }
  return value.trim();
}

@ApiTags('employees')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'Insufficient role, department scope or employee ownership.' })
@ApiBadRequestResponse({ description: 'Invalid request data.' })
@ApiNotFoundResponse({ description: 'Requested active resource not found.' })
@ApiConflictResponse({ description: 'Stale version, invalid state transition or conflicting active dependencies.' })
@Controller('employees')
@UseGuards(SessionAuthGuard)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @ApiOperation({ summary: 'List active employees in a managed department' })
  @ApiResponse({ status: 200, schema: arrayOf(employeeResponse) })
  @ApiQuery({ name: 'departmentId', required: true, schema: { type: 'string' } })
  @Get()
  listDepartmentEmployees(
    @CurrentUser() user: AuthUserContext,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.employees.listDepartmentEmployees(
      user,
      requiredString(departmentId, 'departmentId'),
    );
  }

  @ApiOperation({ summary: 'Create employee in a managed department' })
  @ApiBody({ type: CreateEmployeeDto })
  @ApiResponse({ status: 201, schema: employeeResponse })
  @Post()
  createEmployee(
    @CurrentUser() user: AuthUserContext,
    @Body() body: EmployeeMutationInput,
  ) {
    return this.employees.createEmployee(user, body ?? {});
  }

  @ApiOperation({ summary: 'Atomically reorder all active employees within one managed department' })
  @ApiBody({ type: ReorderEmployeesDto })
  @ApiResponse({ status: 200, schema: reorderResponse })
  @Patch('reorder')
  reorderEmployees(
    @CurrentUser() user: AuthUserContext,
    @Body() body: EmployeeReorderInput,
  ) {
    return this.employees.reorderEmployees(user, body ?? {});
  }

  @ApiOperation({ summary: 'Soft-deactivate employee and linked account; pending requests and self-deactivation block the operation' })
  @ApiBody({ type: DeactivateEmployeeDto })
  @ApiResponse({ status: 200, schema: employeeDeletedResponse })
  @Patch(':employeeId/deactivate')
  deactivateEmployee(
    @CurrentUser() user: AuthUserContext,
    @Param('employeeId') employeeId: string,
    @Body() body: EmployeeMutationInput,
  ) {
    return this.employees.deactivateEmployee(
      user,
      requiredString(employeeId, 'employeeId'),
      body ?? {},
    );
  }

  @ApiOperation({ summary: 'Update employee; moving requires management scope over both departments' })
  @ApiBody({ type: UpdateEmployeeDto })
  @ApiResponse({ status: 200, schema: employeeResponse })
  @Patch(':employeeId')
  updateEmployee(
    @CurrentUser() user: AuthUserContext,
    @Param('employeeId') employeeId: string,
    @Body() body: EmployeeMutationInput,
  ) {
    return this.employees.updateEmployee(
      user,
      requiredString(employeeId, 'employeeId'),
      body ?? {},
    );
  }
}
