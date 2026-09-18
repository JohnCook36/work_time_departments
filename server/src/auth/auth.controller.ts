import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import {
  extractSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from './auth.utils';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(field + ' is required');
  }

  return value;
}

function requiredSessionToken(headers: {
  authorization?: string;
  cookie?: string;
}): string {
  const token = extractSessionToken(headers);

  if (!token) {
    throw new UnauthorizedException('Session is required');
  }

  return token;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-code')
  requestCode(@Body() body: { phone?: unknown }) {
    return this.authService.requestCode(requiredString(body?.phone, 'phone'));
  }

  @Post('verify-code')
  async verifyCode(
    @Body() body: { phone?: unknown; code?: unknown },
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.authService.verifyCode(
      requiredString(body?.phone, 'phone'),
      requiredString(body?.code, 'code'),
    );

    const maxAgeSeconds = Math.max(
      0,
      Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1000),
    );

    response.setHeader(
      'Set-Cookie',
      serializeSessionCookie(
        result.token,
        maxAgeSeconds,
        process.env.NODE_ENV === 'production',
      ),
    );

    return {
      expiresAt: result.expiresAt,
      user: result.user,
    };
  }

  @Get('me')
  getCurrentUser(
    @Headers('authorization') authorization?: string,
    @Headers('cookie') cookie?: string,
  ) {
    return this.authService.getCurrentUser(
      requiredSessionToken({ authorization, cookie }),
    );
  }

  @Post('logout')
  async logout(
    @Headers('authorization') authorization: string | undefined,
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.authService.logout(
      requiredSessionToken({ authorization, cookie }),
    );

    response.setHeader(
      'Set-Cookie',
      serializeClearedSessionCookie(process.env.NODE_ENV === 'production'),
    );

    return result;
  }
}
