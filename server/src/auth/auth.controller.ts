import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
} from '@nestjs/common';

import { AuthService } from './auth.service';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(field + ' is required');
  }

  return value;
}

function bearerToken(authorization: string | undefined): string {
  if (!authorization) {
    throw new BadRequestException('Authorization header is required');
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new BadRequestException('Authorization must use Bearer token');
  }

  return match[1].trim();
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-code')
  requestCode(@Body() body: { phone?: unknown }) {
    return this.authService.requestCode(requiredString(body?.phone, 'phone'));
  }

  @Post('verify-code')
  verifyCode(@Body() body: { phone?: unknown; code?: unknown }) {
    return this.authService.verifyCode(
      requiredString(body?.phone, 'phone'),
      requiredString(body?.code, 'code'),
    );
  }

  @Get('me')
  getCurrentUser(@Headers('authorization') authorization?: string) {
    return this.authService.getCurrentUser(bearerToken(authorization));
  }

  @Post('logout')
  logout(@Headers('authorization') authorization?: string) {
    return this.authService.logout(bearerToken(authorization));
  }
}
