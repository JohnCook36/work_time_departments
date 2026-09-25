import { expect, test, type Page, type Route } from '@playwright/test';

function reply(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin':
        route.request().headers().origin || 'http://127.0.0.1:4174',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

async function mockSession(
  page: Page,
  role: 'EMPLOYEE' | 'DEPARTMENT_ADMIN' | 'DEPUTY',
) {
  await page.route('http://localhost:3000/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (route.request().method() === 'OPTIONS') return reply(route, {});

    if (path === '/auth/me') {
      return reply(route, {
        id: 'user-1',
        phoneE164: '+79990000001',
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
            id: 'membership-1',
            role,
            departmentId: 'department-a',
            permissions: role === 'DEPUTY' ? ['AUDIT_READ'] : [],
          },
        ],
      });
    }

    if (path === '/schedule-data/me') {
      return reply(route, {
        period: { year: 2026, month: 9 },
        schedule: null,
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
        shifts: [],
      });
    }

    if (path === '/departments/manageable') {
      return reply(route, [
        {
          id: 'department-a',
          name: 'Front Office',
          kind: 'FO',
          position: 0,
          updatedAt: '2026-09-25T12:00:00.000Z',
        },
      ]);
    }

    if (path === '/schedule-data/department') {
      return reply(route, {
        period: { year: 2026, month: 9 },
        schedule: null,
        department: {
          id: 'department-a',
          name: 'Front Office',
          kind: 'FO',
        },
        employees: [],
        shifts: [],
      });
    }

    if (
      path === '/wishes/department' ||
      path === '/onboarding/admin/pending' ||
      path === '/schedule-data/department/publications'
    ) {
      return reply(route, []);
    }

    if (path === '/onboarding/admin/departments') {
      return reply(route, [
        { id: 'department-a', name: 'Front Office', kind: 'FO' },
      ]);
    }

    return reply(route, []);
  });
}

test('employee mobile bottom navigation has four stable tabs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
  await mockSession(page, 'EMPLOYEE');

  await page.goto('http://127.0.0.1:4174/my-schedule');

  const nav = page.getByRole('navigation', { name: 'Мобильная навигация' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(nav.getByText('Смены', { exact: true })).toBeVisible();
  await expect(nav.getByText('Задачи', { exact: true })).toBeVisible();
  await expect(nav.getByText('Обмен', { exact: true })).toBeVisible();
  await expect(nav.getByText('Профиль', { exact: true })).toBeVisible();

  const active = nav.getByRole('link', { name: /Смены/ });
  await expect(active).toHaveClass(/active/);

  const box = await active.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

test('manager mobile navigation uses More for secondary routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
  await mockSession(page, 'DEPARTMENT_ADMIN');

  await page.goto('http://127.0.0.1:4174/planner');

  const nav = page.getByRole('navigation', { name: 'Мобильная навигация' });
  await expect(nav.getByText('План', { exact: true })).toBeVisible();
  await expect(nav.getByText('Запросы', { exact: true })).toBeVisible();
  await expect(nav.getByText('Задачи', { exact: true })).toBeVisible();
  await expect(nav.getByText('Ещё', { exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: /План/ })).toHaveClass(/active/);

  await nav.getByRole('button', { name: /Ещё/ }).click();
  const more = page.getByRole('region', { name: 'Дополнительная навигация' });
  await expect(more).toBeVisible();
  await expect(more.getByRole('link', { name: /Уведомления/ })).toBeVisible();
  await expect(more.getByRole('link', { name: /Профиль/ })).toBeVisible();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

test('deputy capability navigation never grants Planner implicitly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
  await mockSession(page, 'DEPUTY');

  await page.goto('http://127.0.0.1:4174/my-schedule');

  const nav = page.getByRole('navigation', { name: 'Мобильная навигация' });
  await expect(nav.getByText('Смены', { exact: true })).toBeVisible();
  await expect(nav.getByText('План', { exact: true })).toHaveCount(0);

  await nav.getByRole('button', { name: /Ещё/ }).click();
  const more = page.getByRole('region', { name: 'Дополнительная навигация' });
  await expect(more.getByRole('link', { name: /Журнал/ })).toBeVisible();
  await expect(more.getByRole('link', { name: /План/ })).toHaveCount(0);
});
