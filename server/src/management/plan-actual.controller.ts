import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PlanActualService } from './plan-actual.service';

function toInteger(value: string | undefined, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new BadRequestException(field + ' must be an integer');
  }
  return parsed;
}

@Controller('management')
@UseGuards(SessionAuthGuard)
export class PlanActualController {
  constructor(private readonly planActual: PlanActualService) {}

  @Get('plan-actual')
  read(
    @CurrentUser() user: AuthUserContext,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.planActual.read(
      user,
      toInteger(year, 'year'),
      toInteger(month, 'month'),
      departmentId?.trim() || undefined,
    );
  }
}
