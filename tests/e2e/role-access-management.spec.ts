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
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`role access management is usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);

    await page.route('**/auth/me', route =>
      reply(route, {
        id: 'account-super-secret',
        phoneE164: '+79990000000',
        employee: {
          id: 'employee-super',
          displayName: 'Супер Администратор',
          departmentId: 'department-fo',
          departmentName: 'Front Office',
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
        },
        memberships: [
          {
            id: 'membership-super',
            role: 'SUPER_ADMIN',
            departmentId: null,
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

    await page.route('**/schedule-data/department?**', route =>
      reply(route, {
        period: { year: 2026, month: 9 },
        schedule: {
          id: 'schedule-fo',
          updatedAt: '2026-09-25T12:00:00.000Z',
        },
        department: {
          id: 'department-fo',
          name: 'Front Office',
          kind: 'FO',
        },
        employees: [
          {
            id: 'employee-deputy',
            displayName: 'Екатерина Зайцева',
            employmentRate: 1,
            scheduleMode: 'FLEXIBLE',
            fixedStartTime: null,
            fixedEndTime: null,
            departmentId: 'department-fo',
            position: 1,
            isActive: true,
            isLinked: true,
            updatedAt: '2026-09-25T12:00:00.000Z',
          },
        ],
        shifts: [],
      }),
    );

    let assignment = {
      id: 'membership-deputy',
      role: 'DEPUTY',
      departmentId: 'department-fo',
      permissions: ['SCHEDULE_READ'],
      employee: {
        id: 'employee-deputy',
        displayName: 'Екатерина Зайцева',
      },
      isActive: true,
      updatedAt: '2026-09-25T12:00:00.000Z',
    };

    let created = false;

    await page.route('**/memberships/manageable?**', route =>
      reply(route, created ? [assignment] : []),
    );

    await page.route('**/memberships', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = route.request().postDataJSON() as {
        employeeId: string;
        departmentId: string;
        role: string;
        permissions: string[];
      };
      expect(body).toMatchObject({
        employeeId: 'employee-deputy',
        departmentId: 'department-fo',
        role: 'DEPUTY',
      });
      expect(body.permissions).toContain('SCHEDULE_READ');
      created = true;
      return reply(route, assignment, 201);
    });

    await page.route('**/memberships/membership-deputy/permissions', async route => {
      const body = route.request().postDataJSON() as {
        permissions: string[];
        expectedUpdatedAt: string;
      };
      expect(body.expectedUpdatedAt).toBe(assignment.updatedAt);
      expect(body.permissions).toContain('AUDIT_READ');
      assignment = {
        ...assignment,
        permissions: body.permissions,
        updatedAt: '2026-09-25T12:10:00.000Z',
      };
      return reply(route, assignment);
    });

    await page.route('**/memberships/membership-deputy/deactivate', async route => {
      const body = route.request().postDataJSON() as {
        expectedUpdatedAt: string;
      };
      expect(body.expectedUpdatedAt).toBe(assignment.updatedAt);
      return reply(route, {
        status: 'ok',
        membershipId: assignment.id,
      });
    });

    await page.goto('http://127.0.0.1:4174/roles-access');

    await expect(
      page.getByRole('heading', { name: 'Роли и доступ' }),
    ).toBeVisible();

    await page.getByLabel('Роль').selectOption('DEPUTY');
    await page
      .getByLabel('Просмотр графика')
      .first()
      .check();

    await page.getByRole('button', { name: 'Создать назначение' }).click();

    const card = page.getByLabel('Назначение Екатерина Зайцева');
    await expect(card).toBeVisible();
    await expect(card.getByText('Заместитель')).toBeVisible();

    await card.getByLabel('Просмотр журнала').check();
    await card.getByRole('button', { name: 'Сохранить права' }).click();
    await expect(page.getByText('Права заместителя обновлены.')).toBeVisible();

    await card.getByRole('button', { name: 'Отключить доступ' }).click();
    await expect(
      card.getByRole('button', { name: 'Подтвердить отключение' }),
    ).toBeVisible();
    await card
      .getByRole('button', { name: 'Подтвердить отключение' })
      .click();

    await expect(card).toHaveCount(0);
    await expect(page.getByText('Назначение отключено.')).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
