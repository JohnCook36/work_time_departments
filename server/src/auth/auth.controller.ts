import { ApiTags, ApiOperation, ApiResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiSecurity, ApiBody } from '@nestjs/swagger';
import { codeSentResponse, currentUserResponse, okResponse, verifyCodeResponse } from '../openapi.responses';
import { RequestCodeDto, VerifyCodeDto } from './auth.dto';

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

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Request a phone verification code' })
  @ApiBody({ type: RequestCodeDto })
  @ApiResponse({ status: 201, schema: codeSentResponse })
  @ApiBadRequestResponse({ description: 'Invalid phone or verification code format.' })
  @ApiResponse({ status: 429, description: 'Request cooldown or verification attempt limit.' })
  @ApiResponse({ status: 503, description: 'OTP delivery/configuration unavailable; production SMS is not connected yet.' })
  @Post('request-code')
  requestCode(@Body() body: { phone?: unknown }) {
    return this.authService.requestCode(requiredString(body?.phone, 'phone'));
  }

  @ApiOperation({ summary: 'Verify code and set the HttpOnly session cookie' })
  @ApiBody({ type: VerifyCodeDto })
  @ApiResponse({ status: 201, schema: verifyCodeResponse })
  @ApiBadRequestResponse({ description: 'Invalid phone or verification code format.' })
  @ApiResponse({ status: 429, description: 'Request cooldown or verification attempt limit.' })
  @ApiResponse({ status: 503, description: 'OTP delivery/configuration unavailable; production SMS is not connected yet.' })
  @ApiUnauthorizedResponse({ description: 'Invalid/expired code or missing/invalid session.' })
  @ApiForbiddenResponse({ description: 'Account is inactive.' })
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

  @ApiOperation({ summary: 'Read the authenticated user and memberships' })
  @ApiResponse({ status: 200, schema: currentUserResponse })
  @ApiSecurity('session')
  @ApiSecurity('sessionBearer')
  @ApiUnauthorizedResponse({ description: 'Invalid/expired code or missing/invalid session.' })
  @Get('me')
  getCurrentUser(
    @Headers('authorization') authorization?: string,
    @Headers('cookie') cookie?: string,
  ) {
    return this.authService.getCurrentUser(
      requiredSessionToken({ authorization, cookie }),
    );
  }

  @ApiOperation({ summary: 'Revoke the session and clear its cookie' })
  @ApiResponse({ status: 201, schema: okResponse })
  @ApiSecurity('session')
  @ApiSecurity('sessionBearer')
  @ApiUnauthorizedResponse({ description: 'Invalid/expired code or missing/invalid session.' })
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
