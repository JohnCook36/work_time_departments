import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { DepartmentsService } from './departments.service';

@Controller('departments')
@UseGuards(SessionAuthGuard)
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get('manageable')
  listManageable(@CurrentUser() user: AuthUserContext) {
    return this.departments.listManageable(user);
  }
}
