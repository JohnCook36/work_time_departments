import type { INestApplication } from '@nestjs/common';

interface RequestLike {
  method?: string;
  headers: {
    origin?: string | string[];
  };
}

interface ResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

interface HttpSecurityOptions {
  frontendOrigin?: string;
  nodeEnv?: string;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function normalizeFrontendOrigin(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('FRONTEND_ORIGIN must be a valid http(s) origin');
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'FRONTEND_ORIGIN must contain only an http(s) origin without path, query, credentials or fragment',
    );
  }

  return parsed.origin;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function applySecurityHeaders(
  response: ResponseLike,
  nodeEnv: string | undefined,
): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cache-Control', 'no-store');

  if (nodeEnv === 'production') {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
}

function rejectOrigin(response: ResponseLike): void {
  response.statusCode = 403;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(
    JSON.stringify({
      statusCode: 403,
      message: 'Origin is not allowed',
    }),
  );
}

export function configureHttpSecurity(
  app: INestApplication,
  options: HttpSecurityOptions,
): { frontendOrigin?: string } {
  const frontendOrigin = normalizeFrontendOrigin(options.frontendOrigin);

  if (options.nodeEnv === 'production' && !frontendOrigin) {
    throw new Error('FRONTEND_ORIGIN is required in production');
  }

  app.use(
    (
      request: RequestLike,
      response: ResponseLike,
      next: () => void,
    ): void => {
      applySecurityHeaders(response, options.nodeEnv);
      next();
    },
  );

  if (frontendOrigin) {
    app.enableCors({
      origin: (
        requestOrigin: string | undefined,
        callback: (error: Error | null, allow?: boolean) => void,
      ) => {
        callback(null, !requestOrigin || requestOrigin === frontendOrigin);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    });

    app.use(
      (
        request: RequestLike,
        response: ResponseLike,
        next: () => void,
      ): void => {
        const method = (request.method ?? 'GET').toUpperCase();
        if (SAFE_METHODS.has(method)) {
          next();
          return;
        }

        const origin = firstHeader(request.headers.origin);
        if (!origin || origin === frontendOrigin) {
          next();
          return;
        }

        rejectOrigin(response);
      },
    );
  }

  return { frontendOrigin };
}
