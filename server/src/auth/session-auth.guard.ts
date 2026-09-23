import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService, AuthUserContext } from './auth.service';
import { extractSessionToken } from './auth.utils';

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
    cookie?: string;
  };
  authUser?: AuthUserContext;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractSessionToken(request.headers);

    if (!token) {
      throw new UnauthorizedException('Session is required');
    }

    request.authUser = await this.authService.getCurrentUser(token);
    return true;
  }
}
