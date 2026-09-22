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

@Controller('departments')
@UseGuards(SessionAuthGuard)
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() body: DepartmentMutationInput,
  ) {
    return this.departments.createDepartment(user, body ?? {});
  }

  @Patch('reorder')
  reorder(
    @CurrentUser() user: AuthUserContext,
    @Body() body: DepartmentReorderInput,
  ) {
    return this.departments.reorderDepartments(user, body ?? {});
  }

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

  @Get('manageable')
  listManageable(@CurrentUser() user: AuthUserContext) {
    return this.departments.listManageable(user);
  }
}
