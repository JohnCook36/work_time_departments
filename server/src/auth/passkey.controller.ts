import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  activationInvitationInfoResponse,
  issuedActivationInvitationResponse,
  okResponse,
  passkeyAuthenticationOptionsResponse,
  passkeyAuthenticationVerifiedResponse,
  passkeyCredentialListResponse,
  passkeyRegistrationOptionsResponse,
  passkeyRegistrationVerifiedResponse,
} from '../openapi.responses';
import type { AuthUserContext } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from './passkey-webauthn';
import { PasskeyService } from './passkey.service';
import { SessionAuthGuard } from './session-auth.guard';
import { serializeSessionCookie } from './auth.utils';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(field + ' is required');
  }
  return value.trim();
}

@ApiTags('auth')
@Controller('auth')
export class PasskeyController {
  constructor(private readonly passkeys: PasskeyService) {}

  @ApiOperation({ summary: 'Create a one-time employee activation invitation' })
  @ApiSecurity('session')
  @ApiSecurity('sessionBearer')
  @ApiResponse({ status: 201, schema: issuedActivationInvitationResponse })
  @UseGuards(SessionAuthGuard)
  @Post('activation/employees/:employeeId/invitation')
  issueInvitation(
    @CurrentUser() user: AuthUserContext,
    @Param('employeeId') employeeId: string,
  ) {
    return this.passkeys.issueActivationInvitation(
      user,
      requiredString(employeeId, 'employeeId'),
    );
  }

  @ApiOperation({ summary: 'Reset employee sessions/passkeys and issue recovery invitation' })
  @ApiSecurity('session')
  @ApiSecurity('sessionBearer')
  @ApiConflictResponse({ description: 'Account cannot be reset in its current state.' })
  @ApiResponse({ status: 201, schema: issuedActivationInvitationResponse })
  @UseGuards(SessionAuthGuard)
  @Post('activation/employees/:employeeId/recovery')
  recoverAccess(
    @CurrentUser() user: AuthUserContext,
    @Param('employeeId') employeeId: string,
  ) {
    return this.passkeys.resetAccessAndIssueRecovery(
      user,
      requiredString(employeeId, 'employeeId'),
    );
  }

  @ApiOperation({ summary: 'Resolve a one-time activation token or short code' })
  @ApiUnauthorizedResponse({ description: 'Invitation is invalid or expired.' })
  @ApiResponse({ status: 201, schema: activationInvitationInfoResponse })
  @Post('activation/resolve')
  resolveInvitation(@Body() body: Record<string, unknown>) {
    return this.passkeys.resolveInvitation(
      requiredString(body?.secret, 'secret'),
    );
  }

  @ApiOperation({ summary: 'Create WebAuthn registration options for an invitation' })
  @ApiBadRequestResponse({ description: 'Invalid activation input.' })
  @ApiResponse({ status: 201, schema: passkeyRegistrationOptionsResponse })
  @Post('passkey/registration/options')
  registrationOptions(@Body() body: Record<string, unknown>) {
    return this.passkeys.createRegistrationOptions(
      requiredString(body?.secret, 'secret'),
    );
  }

  @ApiOperation({ summary: 'Verify passkey registration and create a durable session' })
  @ApiResponse({ status: 201, schema: passkeyRegistrationVerifiedResponse })
  @Post('passkey/registration/verify')
  async verifyRegistration(
    @Body()
    body: {
      secret?: unknown;
      response?: RegistrationResponseJSON;
    },
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    if (!body?.response || typeof body.response !== 'object') {
      throw new BadRequestException('response is required');
    }

    const result = await this.passkeys.completeRegistration(
      requiredString(body.secret, 'secret'),
      body.response,
    );
    this.setSessionCookie(response, result.token, result.expiresAt);

    return {
      expiresAt: result.expiresAt,
      user: result.user,
    };
  }

  @ApiOperation({ summary: 'Create discoverable-passkey authentication options' })
  @ApiResponse({ status: 201, schema: passkeyAuthenticationOptionsResponse })
  @Post('passkey/authentication/options')
  authenticationOptions() {
    return this.passkeys.createAuthenticationOptions();
  }

  @ApiOperation({ summary: 'Verify passkey authentication and create a durable session' })
  @ApiResponse({ status: 201, schema: passkeyAuthenticationVerifiedResponse })
  @Post('passkey/authentication/verify')
  async verifyAuthentication(
    @Body() body: { response?: AuthenticationResponseJSON },
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    if (!body?.response || typeof body.response !== 'object') {
      throw new BadRequestException('response is required');
    }

    const result = await this.passkeys.completeAuthentication(body.response);
    this.setSessionCookie(response, result.token, result.expiresAt);

    return {
      expiresAt: result.expiresAt,
      userId: result.userId,
    };
  }

  @ApiOperation({ summary: 'List active passkeys for the current account' })
  @ApiSecurity('session')
  @ApiSecurity('sessionBearer')
  @ApiResponse({ status: 200, schema: passkeyCredentialListResponse })
  @UseGuards(SessionAuthGuard)
  @Get('passkeys')
  listPasskeys(@CurrentUser() user: AuthUserContext) {
    return this.passkeys.listCredentials(user);
  }

  @ApiOperation({ summary: 'Revoke one passkey while preserving at least one recovery-capable credential' })
  @ApiSecurity('session')
  @ApiSecurity('sessionBearer')
  @ApiResponse({ status: 200, schema: okResponse })
  @UseGuards(SessionAuthGuard)
  @Delete('passkeys/:credentialId')
  revokePasskey(
    @CurrentUser() user: AuthUserContext,
    @Param('credentialId') credentialId: string,
  ) {
    return this.passkeys.revokeCredential(
      user,
      requiredString(credentialId, 'credentialId'),
    );
  }

  private setSessionCookie(
    response: HeaderResponse,
    token: string,
    expiresAt: string,
  ) {
    const maxAgeSeconds = Math.max(
      0,
      Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
    );
    response.setHeader(
      'Set-Cookie',
      serializeSessionCookie(
        token,
        maxAgeSeconds,
        process.env.NODE_ENV === 'production',
      ),
    );
  }
}
