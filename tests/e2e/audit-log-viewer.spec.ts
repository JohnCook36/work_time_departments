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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`audit viewer stays scoped, paginated and private at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-25T15:00:00Z'));

    await page.route('**/auth/me', route =>
      reply(route, {
        id: 'account-admin-secret',
        phoneE164: '+79990000000',
        employee: {
          id: 'employee-admin',
          displayName: 'Анна Администратор',
          departmentId: 'department-fo',
          departmentName: 'Front Office',
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
        },
        memberships: [
          {
            id: 'membership-admin',
            role: 'DEPARTMENT_ADMIN',
            departmentId: 'department-fo',
            permissions: [],
          },
        ],
      }),
    );

    await page.route('**/departments/manageable', route =>
      reply(route, [
        {
          id: 'department-fo',
          name: 'Front Office',
          kind: 'FO',
          position: 0,
          updatedAt: '2026-09-25T12:00:00.000Z',
        },
      ]),
    );

    await page.route('**/audit-events?**', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('cursor') === 'audit-2') {
        return reply(route, {
          items: [
            {
              id: 'audit-3',
              action: 'ONBOARDING_APPROVED',
              entityType: 'ONBOARDING_REQUEST',
              entityId: 'request-3',
              departmentId: 'department-fo',
              actorLabel: 'Анна Администратор',
              createdAt: '2026-09-25T10:00:00.000Z',
            },
          ],
          nextCursor: null,
        });
      }

      return reply(route, {
        items: [
          {
            id: 'audit-1',
            action: 'SCHEDULE_PUBLISHED',
            entityType: 'SCHEDULE',
            entityId: 'schedule-1',
            departmentId: 'department-fo',
            actorLabel: 'Анна Администратор',
            createdAt: '2026-09-25T12:00:00.000Z',
          },
          {
            id: 'audit-2',
            action: 'SCHEDULE_RULE_UPDATED',
            entityType: 'SCHEDULE_RULE',
            entityId: 'rule-2',
            departmentId: 'department-fo',
            actorLabel: 'Администратор',
            createdAt: '2026-09-25T11:00:00.000Z',
          },
        ],
        nextCursor: 'audit-2',
      });
    });

    await page.goto('http://127.0.0.1:4174/audit');

    await expect(
      page.getByRole('heading', { name: 'Журнал действий' }),
    ).toBeVisible();
    await expect(page.getByText('График опубликован')).toBeVisible();
    await expect(page.getByText('Правило графика изменено')).toBeVisible();
    await expect(page.getByText('Анна Администратор', { exact: true })).toBeVisible();
    await expect(page.getByText('Front Office', { exact: true })).toBeVisible();

    await expect(page.getByText('+79990000000')).toHaveCount(0);
    await expect(page.getByText('account-admin-secret')).toHaveCount(0);

    await page.getByRole('button', { name: 'Показать ещё' }).click();
    await expect(
      page.getByText('Заявка сотрудника подтверждена'),
    ).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
