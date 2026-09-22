import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthUserContext } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  WishMutationInput,
  WishesService,
} from './wishes.service';

function requiredString(value: string | undefined, field: string): string {
  if (!value?.trim()) {
    throw new BadRequestException(field + ' is required');
  }
  return value.trim();
}

function requiredInteger(value: string | undefined, field: string): number {
  const normalized = requiredString(value, field);
  if (!/^\d+$/.test(normalized)) {
    throw new BadRequestException(field + ' must be an integer');
  }
  return Number(normalized);
}

@Controller('wishes')
@UseGuards(SessionAuthGuard)
export class WishesController {
  constructor(private readonly wishes: WishesService) {}

  @Get('department')
  listDepartmentWishes(
    @CurrentUser() user: AuthUserContext,
    @Query('departmentId') departmentId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.wishes.listDepartmentWishes(
      user,
      requiredString(departmentId, 'departmentId'),
      requiredInteger(year, 'year'),
      requiredInteger(month, 'month'),
    );
  }

  @Post()
  createWish(
    @CurrentUser() user: AuthUserContext,
    @Body() body: WishMutationInput,
  ) {
    return this.wishes.createWish(user, body ?? {});
  }

  @Delete(':wishId')
  deleteWish(
    @CurrentUser() user: AuthUserContext,
    @Param('wishId') wishId: string,
  ) {
    return this.wishes.deleteWish(
      user,
      requiredString(wishId, 'wishId'),
    );
  }
}
