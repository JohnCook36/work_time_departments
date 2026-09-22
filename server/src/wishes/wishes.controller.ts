import { ApiTags, ApiOperation, ApiResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiSecurity, ApiNotFoundResponse, ApiBody, ApiQuery } from '@nestjs/swagger';
import { arrayOf, wishDeletedResponse, wishResponse } from '../openapi.responses';
import { CreateWishDto } from './wishes.dto';

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

@ApiTags('wishes')
@ApiSecurity('session')
@ApiSecurity('sessionBearer')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'Insufficient role, department scope or employee ownership.' })
@ApiBadRequestResponse({ description: 'Invalid request data.' })
@ApiNotFoundResponse({ description: 'Requested active resource not found.' })
@Controller('wishes')
@UseGuards(SessionAuthGuard)
export class WishesController {
  constructor(private readonly wishes: WishesService) {}

  @ApiOperation({ summary: 'List wishes for active employees in a managed department' })
  @ApiResponse({ status: 200, schema: arrayOf(wishResponse) })
  @ApiQuery({ name: 'departmentId', required: true, schema: { type: 'string' } })
  @ApiQuery({ name: 'year', required: true, schema: { type: 'integer', minimum: 1970, maximum: 9999 } })
  @ApiQuery({ name: 'month', required: true, schema: { type: 'integer', minimum: 1, maximum: 12 } })
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

  @ApiOperation({ summary: 'Create a wish for an active employee in a managed department' })
  @ApiBody({ type: CreateWishDto })
  @ApiResponse({ status: 201, schema: wishResponse })
  @Post()
  createWish(
    @CurrentUser() user: AuthUserContext,
    @Body() body: WishMutationInput,
  ) {
    return this.wishes.createWish(user, body ?? {});
  }

  @ApiOperation({ summary: 'Delete a wish within management scope' })
  @ApiResponse({ status: 200, schema: wishDeletedResponse })
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
