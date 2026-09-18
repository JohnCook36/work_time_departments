import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService, AuthUserContext } from './auth.service';

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  authUser?: AuthUserContext;
}

function extractBearerToken(authorization?: string): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new UnauthorizedException('Bearer token is required');
  }

  return match[1].trim();
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    request.authUser = await this.authService.getCurrentUser(token);
    return true;
  }
}
