import { expect, test, type Page, type Route } from '@playwright/test';

function reply(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin':
        route.request().headers().origin || 'http://localhost:4174',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

async function addVirtualPasskeyAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`employee activates a Passkey without SMS at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await addVirtualPasskeyAuthenticator(page);

    let authenticated = false;
    let registrationVerifyBody: Record<string, unknown> | null = null;
    let authenticationVerifyBody: Record<string, unknown> | null = null;

    await page.route(
      /https?:\/\/(?:localhost|127\.0\.0\.1):3000\/.*/,
      async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;

        if (request.method() === 'OPTIONS') return reply(route, {});

        if (path === '/auth/me') {
          if (!authenticated) {
            return reply(route, { message: 'Session is required' }, 401);
          }
          return reply(route, {
            id: 'employee-user',
            phoneE164: null,
            employee: {
              id: 'employee-1',
              displayName: 'Иванов И.И.',
              departmentId: 'department-a',
              departmentName: 'Front Office',
              employmentRate: 1,
              scheduleMode: 'FLEXIBLE',
              fixedStartTime: null,
              fixedEndTime: null,
            },
            memberships: [{
              id: 'membership-1',
              role: 'EMPLOYEE',
              departmentId: 'department-a',
              permissions: [],
            }],
          });
        }

        if (path === '/auth/activation/resolve') {
          expect(request.postDataJSON()).toEqual({
            secret: 'opaque-invitation',
          });
          return reply(route, {
            invitationId: 'invitation-1',
            purpose: 'ACTIVATION',
            expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
            employee: {
              id: 'employee-1',
              displayName: 'Иванов И.И.',
              departmentId: 'department-a',
              departmentName: 'Front Office',
            },
          }, 201);
        }

        if (path === '/auth/passkey/registration/options') {
          return reply(route, {
            challenge: Buffer.alloc(32, 11).toString('base64url'),
            rp: {
              id: 'localhost',
              name: 'Work Time Departments',
            },
            user: {
              id: Buffer.alloc(32, 22).toString('base64url'),
              name: 'wtd-test-user',
              displayName: 'wtd-test-user',
            },
            pubKeyCredParams: [
              { type: 'public-key', alg: -7 },
              { type: 'public-key', alg: -257 },
            ],
            timeout: 60_000,
            attestation: 'none',
            authenticatorSelection: {
              residentKey: 'required',
              requireResidentKey: true,
              userVerification: 'required',
            },
            excludeCredentials: [],
          }, 201);
        }

        if (path === '/auth/passkey/registration/verify') {
          registrationVerifyBody =
            request.postDataJSON() as Record<string, unknown>;
          authenticated = true;
          return reply(route, {
            expiresAt: '2026-12-28T18:00:00.000Z',
            user: {
              id: 'employee-user',
              phoneE164: null,
              onboardingRequired: false,
            },
          }, 201);
        }

        if (path === '/auth/logout') {
          authenticated = false;
          return reply(route, { status: 'ok' }, 201);
        }

        if (path === '/auth/passkey/authentication/options') {
          return reply(route, {
            challenge: Buffer.alloc(32, 33).toString('base64url'),
            rpId: 'localhost',
            timeout: 60_000,
            userVerification: 'required',
          }, 201);
        }

        if (path === '/auth/passkey/authentication/verify') {
          authenticationVerifyBody =
            request.postDataJSON() as Record<string, unknown>;
          authenticated = true;
          return reply(route, {
            expiresAt: '2026-12-28T18:00:00.000Z',
            userId: 'employee-user',
          }, 201);
        }

        if (path === '/schedule-data/me') {
          return reply(route, {
            period: { year: 2026, month: 9 },
            schedule: null,
            employee: {
              id: 'employee-1',
              displayName: 'Иванов И.И.',
              employmentRate: 1,
              scheduleMode: 'FLEXIBLE',
              fixedStartTime: null,
              fixedEndTime: null,
              department: {
                id: 'department-a',
                name: 'Front Office',
                kind: 'FO',
              },
            },
            shifts: [],
          });
        }

        return reply(route, []);
      },
    );

    await page.goto(
      'http://localhost:4174/login?activation=opaque-invitation',
    );

    await expect(
      page.getByRole('heading', { name: 'Активация аккаунта' }),
    ).toBeVisible();
    await expect(
      page.getByText(/Иванов И.И. · Front Office/),
    ).toBeVisible();
    await expect(page.getByText(/SMS/)).toHaveCount(0);

    await page
      .getByRole('button', { name: 'Создать Passkey и войти' })
      .click();

    await expect.poll(() => registrationVerifyBody).not.toBeNull();
    const verifyBody = registrationVerifyBody as {
      secret?: string;
      response?: {
        type?: string;
        rawId?: string;
        response?: {
          clientDataJSON?: string;
          attestationObject?: string;
        };
      };
    };
    expect(verifyBody.secret).toBe('opaque-invitation');
    expect(verifyBody.response?.type).toBe('public-key');
    expect(verifyBody.response?.rawId).toBeTruthy();
    expect(verifyBody.response?.response?.clientDataJSON).toBeTruthy();
    expect(verifyBody.response?.response?.attestationObject).toBeTruthy();

    await expect(page).not.toHaveURL(/\/login/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    const logoutStatus = await page.evaluate(async () => {
      const response = await fetch('http://localhost:3000/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      return response.status;
    });
    expect(logoutStatus).toBe(201);

    await page.goto('http://localhost:4174/login');
    await expect(
      page.getByRole('button', { name: 'Войти с Passkey' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Войти с Passkey' }).click();

    await expect.poll(() => authenticationVerifyBody).not.toBeNull();
    const authenticationBody = authenticationVerifyBody as {
      response?: {
        type?: string;
        rawId?: string;
        response?: {
          authenticatorData?: string;
          signature?: string;
          userHandle?: string | null;
        };
      };
    };
    expect(authenticationBody.response?.type).toBe('public-key');
    expect(authenticationBody.response?.rawId).toBeTruthy();
    expect(
      authenticationBody.response?.response?.authenticatorData,
    ).toBeTruthy();
    expect(authenticationBody.response?.response?.signature).toBeTruthy();
    expect(authenticationBody.response?.response?.userHandle).toBeTruthy();

    await expect(page).not.toHaveURL(/\/login/);
  });
}
