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
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`persisted notification inbox is usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);

    await page.route('**/auth/me', route =>
      reply(route, {
        id: 'user-employee',
        phoneE164: '+79990000000',
        employee: {
          id: 'employee-a',
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
            id: 'membership-a',
            role: 'EMPLOYEE',
            departmentId: 'department-a',
            permissions: [],
          },
        ],
      }),
    );

    let items = [
      {
        id: 'notification-1',
        category: 'SHIFT_CHANGE',
        entityType: 'SHIFT_CHANGE_REQUEST',
        entityId: 'request-1',
        eventKey: 'shift-change:request-1:CREATED',
        critical: false,
        readAt: null,
        createdAt: '2026-09-25T12:00:00.000Z',
      },
      {
        id: 'notification-2',
        category: 'SYSTEM',
        entityType: 'SYSTEM',
        entityId: null,
        eventKey: 'system:pilot',
        critical: true,
        readAt: '2026-09-25T11:00:00.000Z',
        createdAt: '2026-09-25T11:00:00.000Z',
      },
    ];

    await page.route('**/notifications', route => {
      if (
        route.request().resourceType() === 'document' ||
        route.request().method() !== 'GET'
      ) {
        return route.fallback();
      }
      return reply(route, { items, nextCursor: null });
    });

    await page.route('**/notification-preferences', route =>
      reply(route, [
        { category: 'SHIFT_CHANGE', enabled: true, configurable: true },
        { category: 'SYSTEM', enabled: true, configurable: false },
      ]),
    );

    await page.route('**/notifications/notification-1/read', route => {
      items = items.map(item =>
        item.id === 'notification-1'
          ? { ...item, readAt: '2026-09-25T12:30:00.000Z' }
          : item,
      );
      return reply(route, { status: 'ok', notificationId: 'notification-1' });
    });

    await page.route('**/notifications/read-all', route =>
      reply(route, { status: 'ok', updated: 1 }),
    );

    await page.route('**/notification-preferences/SHIFT_CHANGE', route =>
      reply(route, {
        category: 'SHIFT_CHANGE',
        enabled: false,
        configurable: true,
      }),
    );

    await page.goto('http://127.0.0.1:4174/notifications');

    await expect(page.getByRole('heading', { name: 'Уведомления' })).toBeVisible();
    await expect(page.getByText('Непрочитано: 1')).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Вам предложили обмен или подмену смены.',
      }),
    ).toBeVisible();

    await page
      .getByRole('button', {
        name: 'Вам предложили обмен или подмену смены.',
      })
      .click();
    await expect(page.getByText('Непрочитано: 0')).toBeVisible();

    const systemPreference = page.getByLabel('Уведомления: Системное');
    await expect(systemPreference).toBeDisabled();

    const shiftPreference = page.getByLabel('Уведомления: Обмен сменами');
    await shiftPreference.click();
    await expect(shiftPreference).not.toBeChecked();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
