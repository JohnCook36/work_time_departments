import { expect, test, type Route } from '@playwright/test';

function reply(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin':
        route.request().headers().origin || 'http://127.0.0.1:4174',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`employee acknowledges the exact published schedule at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);

    await page.route('**/auth/me', route =>
      reply(route, {
        id: 'user-employee',
        phoneE164: '+79990000000',
        employee: {
          id: 'employee-1',
          displayName: 'Тестовый сотрудник',
          departmentId: 'department-a',
          departmentName: 'Front Office',
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
        },
        memberships: [
          {
            id: 'membership-employee',
            role: 'EMPLOYEE',
            departmentId: 'department-a',
            permissions: [],
          },
        ],
      }),
    );

    await page.route('**/schedule-data/me?**', route =>
      reply(route, {
        period: { year: 2026, month: 9 },
        schedule: {
          id: 'publication-3',
          updatedAt: '2026-09-25T14:00:00.000Z',
        },
        employee: {
          id: 'employee-1',
          displayName: 'Тестовый сотрудник',
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
        shifts: [
          {
            id: 'shift-1',
            employeeId: 'employee-1',
            date: '2026-09-25',
            code: null,
            startTime: '08:00',
            endTime: '17:00',
            isOff: false,
            updatedAt: '2026-09-25T13:00:00.000Z',
          },
        ],
      }),
    );

    let acknowledgedAt: string | null = null;

    await page.route('**/schedule-data/me/publication-acknowledgement?**', route =>
      reply(route, {
        publicationId: 'publication-3',
        employeeId: 'employee-1',
        status: acknowledgedAt ? 'ACKNOWLEDGED' : 'NOT_ACKNOWLEDGED',
        acknowledgedAt,
      }),
    );

    await page.route('**/schedule-data/me/publication-acknowledgements', route => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({
        publicationId: 'publication-3',
      });
      acknowledgedAt = '2026-09-25T14:30:00.000Z';
      return reply(
        route,
        {
          id: 'ack-1',
          publicationId: 'publication-3',
          employeeId: 'employee-1',
          acknowledgedAt,
        },
        201,
      );
    });

    await page.goto('http://127.0.0.1:4174/my-schedule');

    await expect(
      page.getByText('Подтвердите ознакомление с графиком'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Ознакомлен' }).click();

    await expect(page.getByText('С графиком ознакомлен')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ознакомлен' }),
    ).toHaveCount(0);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
