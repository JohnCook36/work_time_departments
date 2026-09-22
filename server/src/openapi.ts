import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SESSION_COOKIE_NAME } from './auth/auth.utils';

// Read the package beside src/ or dist/; do not invent a separate release version.
const { version } = require('../package.json') as { version: string };

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Work time departments API')
    .setDescription('Session authentication, employee onboarding and scoped hotel shift planning API. Sign in through auth/request-code and auth/verify-code; the browser sends the HttpOnly session cookie. Swagger metadata does not grant access or replace guards.')
    .setVersion(version)
    .addCookieAuth(SESSION_COOKIE_NAME, {
      type: 'apiKey', in: 'cookie',
      description: 'HttpOnly session cookie set by POST /auth/verify-code; not a password or JWT. Use the browser sign-in flow, not a manually entered Cookie header.',
    }, 'session')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Alternative transport for the same opaque session token; not a JWT.' }, 'sessionBearer')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupOpenApi(app: INestApplication) {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: '/docs/openapi.json',
    raw: ['json'],
    swaggerOptions: { withCredentials: true, persistAuthorization: false },
  });
  return document;
}
