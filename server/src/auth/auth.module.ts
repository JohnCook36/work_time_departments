import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { PasskeyController } from './passkey.controller';
import { PasskeyService } from './passkey.service';
import { AuthorizationService } from './authorization.service';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  controllers: [AuthController, PasskeyController],
  providers: [AuthService, PasskeyService, AuthorizationService, SessionAuthGuard],
  exports: [AuthService, AuthorizationService, SessionAuthGuard],
})
export class AuthModule {}
