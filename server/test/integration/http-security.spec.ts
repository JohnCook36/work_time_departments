import {
  Controller,
  Get,
  INestApplication,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
  configureHttpSecurity,
  normalizeFrontendOrigin,
} from '../../src/security/http-security';

@Controller('security-test')
class SecurityTestController {
  @Get()
  read() {
    return { status: 'ok' };
  }

  @Post()
  write() {
    return { status: 'ok' };
  }
}

describe('HTTP security baseline', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SecurityTestController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureHttpSecurity(app, {
      frontendOrigin: 'http://frontend.test',
      nodeEnv: 'test',
    });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('normalizes a configured origin and rejects unsafe origin-shaped values', () => {
    expect(normalizeFrontendOrigin(' https://example.test/ ')).toBe(
      'https://example.test',
    );
    expect(() =>
      normalizeFrontendOrigin('https://example.test/app'),
    ).toThrow(/origin without path/i);
    expect(() => normalizeFrontendOrigin('javascript:alert(1)')).toThrow(
      /http\(s\) origin/i,
    );
  });

  it('requires FRONTEND_ORIGIN in production', () => {
    expect(() =>
      configureHttpSecurity({} as INestApplication, {
        nodeEnv: 'production',
      }),
    ).toThrow('FRONTEND_ORIGIN is required in production');
  });

  it('sets baseline browser security and no-store headers', async () => {
    const response = await fetch(url + '/security-test');

    expect(response.status).toBe(200);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('permissions-policy')).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
    expect(response.headers.get('cross-origin-opener-policy')).toBe(
      'same-origin',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  it('allows the configured browser origin with credentials', async () => {
    const response = await fetch(url + '/security-test', {
      headers: { Origin: 'http://frontend.test' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://frontend.test',
    );
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
  });

  it('serves a valid preflight only for the configured origin', async () => {
    const allowed = await fetch(url + '/security-test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://frontend.test',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'http://frontend.test',
    );

    const rejected = await fetch(url + '/security-test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects a state-changing browser request from another origin', async () => {
    const response = await fetch(url + '/security-test', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      statusCode: 403,
      message: 'Origin is not allowed',
    });
  });

  it('allows the configured origin and non-browser clients for writes', async () => {
    const allowedBrowser = await fetch(url + '/security-test', {
      method: 'POST',
      headers: {
        Origin: 'http://frontend.test',
      },
    });
    expect(allowedBrowser.status).toBe(201);

    const nonBrowser = await fetch(url + '/security-test', {
      method: 'POST',
    });
    expect(nonBrowser.status).toBe(201);
  });
});
