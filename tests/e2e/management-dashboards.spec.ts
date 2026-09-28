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
      'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

async function mockManagement(page: Page) {
  let norm: number | null = null;

  await page.route(/https?:\/\/(?:localhost|127\.0\.0\.1):3000\/.*/, async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (route.request().method() === 'OPTIONS') return reply(route, {});

    if (path === '/auth/me') {
      return reply(route, {
        id: 'manager-user',
        phoneE164: '+79990000000',
        employee: {
          id: 'manager-employee',
          displayName: 'E2E Руководитель',
          departmentId: 'department-a',
          departmentName: 'Front Office',
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
        },
        memberships: [
          {
            id: 'manager-membership',
            role: 'DEPARTMENT_ADMIN',
            departmentId: 'department-a',
            permissions: [],
          },
        ],
      });
    }

    if (path === '/management/today') {
      return reply(route, {
        date: '2026-09-26',
        attendanceAvailable: false,
        totals: {
          plannedShifts: 1,
          activeAbsences: 1,
          pendingRequests: 1,
          unpublishedDepartments: 0,
        },
        departments: [
          {
            id: 'department-a',
            name: 'Front Office',
            kind: 'FO',
            publication: {
              id: 'publication-1',
              version: 4,
              publishedAt: '2026-09-25T20:00:00.000Z',
            },
            plannedShifts: [
              {
                id: 'shift-1',
                employeeId: 'employee-1',
                displayName: 'Иванов И.И.',
                date: '2026-09-26',
                code: null,
                startTime: '08:00',
                endTime: '17:00',
              },
            ],
            absences: [
              {
                id: 'absence-1',
                employeeId: 'employee-2',
                displayName: 'Петров П.П.',
                type: 'SICK',
                startDate: '2026-09-26',
                endDate: '2026-09-26',
                comment: null,
              },
            ],
            riskCount: 2,
          },
        ],
        pendingRequests: [
          {
            id: 'request-1',
            kind: 'COVER',
            status: 'PENDING_MANAGER',
            requesterDepartmentId: 'department-a',
            targetDepartmentId: 'department-a',
            requesterDisplayName: 'Иванов И.И.',
            targetDisplayName: 'Петров П.П.',
            requesterShift: {
              date: '2026-09-26',
              startTime: '08:00',
              endTime: '17:00',
              code: null,
            },
            targetShift: null,
            createdAt: '2026-09-25T18:00:00.000Z',
          },
        ],
      });
    }

    if (path === '/management/hours' && route.request().method() === 'GET') {
      const departmentNorm = norm === null ? null : norm;
      return reply(route, {
        period: { year: 2026, month: 9 },
        schedule: {
          id: 'schedule-1',
          updatedAt: '2026-09-25T20:00:00.000Z',
        },
        departmentNormConfigured: norm !== null,
        departments: [
          {
            id: 'department-a',
            name: 'Front Office',
            kind: 'FO',
            employeeCount: 1,
            plannedHours: 180,
            productionNormHours: 176,
            departmentNormHours: departmentNorm,
            comparisonNormHours: departmentNorm ?? 176,
            normUpdatedAt: norm === null ? null : '2026-09-26T07:00:00.000Z',
            deltaHours: 180 - (departmentNorm ?? 176),
            outsideNormCount: 1,
          },
        ],
        employees: [
          {
            id: 'employee-1',
            displayName: 'Иванов И.И.',
            departmentId: 'department-a',
            employmentRate: 1,
            shiftCount: 20,
            dayHours: 160,
            nightHours: 20,
            plannedHours: 180,
            productionNormHours: 176,
            departmentNormHours: departmentNorm,
            comparisonNormHours: departmentNorm ?? 176,
            deltaHours: 180 - (departmentNorm ?? 176),
            status:
              Math.abs(180 - (departmentNorm ?? 176)) < 0.01
                ? 'balanced'
                : 180 > (departmentNorm ?? 176)
                  ? 'over'
                  : 'under',
          },
        ],
      });
    }

    if (path === '/management/hours/norm' && route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}') as {
        fullTimeHours?: number;
      };
      norm = body.fullTimeHours ?? null;
      return reply(route, {
        id: 'norm-1',
        departmentId: 'department-a',
        year: 2026,
        month: 9,
        fullTimeHours: norm,
        createdByUserId: 'manager-user',
        updatedByUserId: 'manager-user',
        createdAt: '2026-09-26T07:00:00.000Z',
        updatedAt: '2026-09-26T07:00:00.000Z',
        created: true,
      });
    }

    return reply(route, []);
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`manager today dashboard is operational at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-26T07:00:00Z'));
    await mockManagement(page);

    await page.goto('http://127.0.0.1:4174/');

    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
    await expect(page.getByText('Опубликована версия v4')).toBeVisible();
    await expect(page.getByText('Иванов И.И.').first()).toBeVisible();
    await expect(page.getByText('Петров П.П.').first()).toBeVisible();
    await expect(page.getByText(/Явка не показывается/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test(`team planned-hours dashboard and department norm work at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-26T07:00:00Z'));
    await mockManagement(page);

    await page.goto('http://127.0.0.1:4174/team-hours');

    await expect(
      page.getByRole('heading', { name: 'Часы команды' }),
    ).toBeVisible();
    await expect(page.getByText('Переработка по графику')).toBeVisible();
    await expect(page.getByText(/Это не фактическая посещаемость/)).toBeVisible();

    const filters = page.locator('select');
    await filters.nth(2).selectOption('department-a');
    await page.getByLabel('Норма отдела на полную ставку').fill('180');
    await page.getByRole('button', { name: 'Сохранить норму отдела' }).click();

    await expect(
      page.getByText(/Для настроенных отделов сравнение идёт с нормой отдела/),
    ).toBeVisible();
    await expect(page.getByText('Норма', { exact: true })).toBeVisible();

    const table = page.locator('table').first();
    const shell = table.locator('xpath=..');
    if (viewport.width === 390) {
      expect(await shell.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      expect((await shell.boundingBox())?.width).toBeLessThan(viewport.width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
