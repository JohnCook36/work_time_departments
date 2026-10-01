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
  await page.route(/https?:\/\/(?:localhost|127\.0\.0\.1):3000\/.*/, async route => {
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

    if (path === '/management/today') {
      return reply(route, {
        date: '2026-09-25',
        attendanceAvailable: false,
        totals: {
          plannedShifts: 0,
          activeAbsences: 0,
          pendingRequests: 0,
          unpublishedDepartments: 1,
        },
        departments: [
          {
            id: 'department-a',
            name: 'Front Office',
            kind: 'FO',
            publication: null,
            plannedShifts: [],
            absences: [],
            riskCount: 1,
          },
        ],
        pendingRequests: [],
      });
    }

    if (path === '/management/hours') {
      return reply(route, {
        period: { year: 2026, month: 9 },
        schedule: null,
        departmentNormConfigured: false,
        departments: [
          {
            id: 'department-a',
            name: 'Front Office',
            kind: 'FO',
            employeeCount: 0,
            plannedHours: 0,
            normHours: 0,
            deltaHours: 0,
            outsideNormCount: 0,
          },
        ],
        employees: [],
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

test('employee uses one burger drawer without management routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
  await mockSession(page, 'EMPLOYEE');

  await page.goto('http://127.0.0.1:4174/my-schedule');

  const menu = page.getByRole('button', { name: 'Меню' });
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox?.height ?? 0).toBeGreaterThanOrEqual(40);
  await expect(
    page.getByRole('navigation', { name: 'Мобильная навигация' }),
  ).toHaveCount(0);

  await menu.click();
  const drawer = page.getByRole('dialog', { name: 'Навигация' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Основное', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Работа', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Аккаунт', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Мои смены/ })).toHaveClass(/active/);
  await expect(drawer.getByRole('link', { name: /Задачи/ })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Обмен сменами/ })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Уведомления/ })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Профиль/ })).toBeVisible();
  await expect(drawer.getByRole('button', { name: /тема/i })).toBeVisible();
  await expect(drawer.getByRole('button', { name: /Выйти/ })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Сегодня/ })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: /Планировщик/ })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: /Роли и доступ/ })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: /Журнал/ })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

test('manager burger drawer exposes management and administration routes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
  await mockSession(page, 'DEPARTMENT_ADMIN');

  await page.goto('http://127.0.0.1:4174/today');
  await page.getByRole('button', { name: 'Меню' }).click();

  const drawer = page.getByRole('dialog', { name: 'Навигация' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Сегодня/ })).toHaveClass(/active/);
  await expect(drawer.getByRole('link', { name: /Планировщик/ })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /План \/ факт/ })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Часы команды/ })).toBeVisible();
  await expect(drawer.getByText('Администрирование', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Роли и доступ/ })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Журнал/ })).toBeVisible();

  await drawer.getByRole('button', { name: 'Закрыть меню' }).click();
  await expect(drawer).toHaveCount(0);
});

test('deputy capability drawer never grants Planner implicitly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
  await mockSession(page, 'DEPUTY');

  await page.goto('http://127.0.0.1:4174/my-schedule');
  await page.getByRole('button', { name: 'Меню' }).click();

  const drawer = page.getByRole('dialog', { name: 'Навигация' });
  await expect(drawer.getByRole('link', { name: /Журнал/ })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Планировщик/ })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: /Сегодня/ })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: /Роли и доступ/ })).toHaveCount(0);
});
