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

@Controller('employees')
@UseGuards(SessionAuthGuard)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

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

  @Post()
  createEmployee(
    @CurrentUser() user: AuthUserContext,
    @Body() body: EmployeeMutationInput,
  ) {
    return this.employees.createEmployee(user, body ?? {});
  }

  @Patch('reorder')
  reorderEmployees(
    @CurrentUser() user: AuthUserContext,
    @Body() body: EmployeeReorderInput,
  ) {
    return this.employees.reorderEmployees(user, body ?? {});
  }

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
