import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthorizationService } from './authorization.service';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthorizationService, SessionAuthGuard],
  exports: [AuthService, AuthorizationService, SessionAuthGuard],
})
export class AuthModule {}
