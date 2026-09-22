import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  DepartmentReorderInput,
  DepartmentsService,
} from './departments.service';

@Controller('departments')
@UseGuards(SessionAuthGuard)
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Patch('reorder')
  reorder(
    @CurrentUser() user: AuthUserContext,
    @Body() body: DepartmentReorderInput,
  ) {
    return this.departments.reorderDepartments(user, body ?? {});
  }

  @Get('manageable')
  listManageable(@CurrentUser() user: AuthUserContext) {
    return this.departments.listManageable(user);
  }
}
