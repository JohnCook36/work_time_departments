import { expect, test, type Route } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin':
          route.request().headers().origin || 'http://127.0.0.1:4174',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        id: 'e2e-super-user',
        phoneE164: '+79990000000',
        employee: {
          id: 'e2e-super-employee',
          displayName: 'E2E Администратор',
          departmentId: 'department-1',
          departmentName: 'Front Office',
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
        },
        memberships: [
          {
            id: 'e2e-super-membership',
            role: 'SUPER_ADMIN',
            departmentId: null,
            permissions: [],
          },
        ],
      }),
    });
  });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`FO preset creates two visible managed rules idempotently at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));

    const timestamp = '2026-09-10T10:00:00.000Z';
    let rules: Array<Record<string, unknown>> = [];

    const reply = (route: Route, body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin':
            route.request().headers().origin || 'http://127.0.0.1:4174',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        },
        body: JSON.stringify(body),
      });

    await page.route('**/departments/manageable', route =>
      reply(route, [
        {
          id: 'department-1',
          name: 'Front Office',
          kind: 'FO',
          position: 0,
          updatedAt: timestamp,
        },
        {
          id: 'department-night',
          name: 'Night',
          kind: 'NIGHT',
          position: 1,
          updatedAt: timestamp,
        },
      ]),
    );
    await page.route('**/wishes/department?**', route => reply(route, []));
    await page.route('**/schedule-data/department?**', route => {
      const url = new URL(route.request().url());
      const departmentId = url.searchParams.get('departmentId');
      return reply(route, {
        period: { year: 2026, month: 9 },
        schedule: { id: 'schedule-1', updatedAt: timestamp },
        department: {
          id: departmentId,
          name: departmentId === 'department-night' ? 'Night' : 'Front Office',
          kind: departmentId === 'department-night' ? 'NIGHT' : 'FO',
        },
        employees: [],
        shifts: [],
      });
    });
    await page.route('**/schedule-rules/manageable', route =>
      reply(route, rules),
    );
    await page.route('**/schedule-data/department/validation?**', route =>
      reply(route, {
        departmentId: 'department-1',
        period: { year: 2026, month: 9 },
        rulesVersion: 'schedule-publication-rules-v1+managed-e2e',
        canPublish: false,
        violations: [
          {
            severity: 'hard',
            code: 'MANAGED_MIN_STAFF_AT_TIME',
            message: 'К 07:00 в Front Office должно быть минимум 2 сотрудника.',
            employeeId: null,
            shiftId: null,
            date: '2026-09-15',
            ruleId: 'fo-opening',
            ruleVersion: 1,
            ruleName: 'Стандарт FO · 2 сотрудника к 07:00',
            expected: 2,
            actual: 1,
            time: '07:00',
            affectedEmployeeIds: [],
            affectedShiftIds: [],
          },
        ],
        coverage: [
          {
            date: '2026-09-15',
            time: '07:00',
            count: 1,
            employeeIds: [],
            shiftIds: [],
            minRequired: 2,
            maxAllowed: 5,
            status: 'below',
          },
          {
            date: '2026-09-15',
            time: '08:00',
            count: 3,
            employeeIds: [],
            shiftIds: [],
            minRequired: null,
            maxAllowed: 5,
            status: 'within',
          },
        ],
      }),
    );
    await page.route(
      '**/schedule-rules/presets/fo/department-1',
      route => {
        const created =
          rules.length === 0
            ? [
                {
                  id: 'fo-max',
                  name: 'Стандарт FO · максимум 5 одновременно',
                  description:
                    'Не более 5 сотрудников Front Office одновременно.',
                  kind: 'MAX_CONCURRENT_EMPLOYEES',
                  scope: 'DEPARTMENT',
                  scopeValue: null,
                  departmentId: 'department-1',
                  priority: 900,
                  severity: 'HARD',
                  isActive: true,
                  isDeleted: false,
                  config: { maxConcurrent: 5 },
                  violationMessage:
                    'В Front Office одновременно работает больше 5 сотрудников.',
                  version: 1,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                  editable: true,
                },
                {
                  id: 'fo-opening',
                  name: 'Стандарт FO · 2 сотрудника к 07:00',
                  description:
                    'К 07:00 в Front Office должны работать минимум 2 сотрудника.',
                  kind: 'MIN_STAFF_AT_TIME',
                  scope: 'DEPARTMENT',
                  scopeValue: null,
                  departmentId: 'department-1',
                  priority: 900,
                  severity: 'HARD',
                  isActive: true,
                  isDeleted: false,
                  config: { time: '07:00', minStaff: 2 },
                  violationMessage:
                    'К 07:00 в Front Office должно быть минимум 2 сотрудника.',
                  version: 1,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                  editable: true,
                },
              ]
            : [];

        if (created.length > 0) rules = created;
        return reply(
          route,
          {
            status: 'ok',
            departmentId: 'department-1',
            created: created.length,
            existing: 2 - created.length,
            rules: created,
          },
          201,
        );
      },
    );

    await page.goto('http://127.0.0.1:4174/planner');

    const toolsTrigger = page.getByRole('button', {
      name: 'Управление графиком',
    });
    const triggerBefore = await toolsTrigger.boundingBox();
    await toolsTrigger.click();
    await page.getByRole('button', { name: 'Управление правилами' }).click();

    const rulesDrawer = page.locator('aside').filter({
      has: page.getByText('Правила графика', { exact: true }),
    });
    await expect(rulesDrawer).toBeVisible();

    const presetDepartment = rulesDrawer.getByLabel('Отдел для стандарта FO');
    await expect(presetDepartment).toHaveValue('department-1');
    await expect(presetDepartment.locator('option')).toHaveCount(1);
    await expect(
      presetDepartment.locator('option').filter({ hasText: 'Front Office' }),
    ).toHaveCount(1);

    const presetButton = rulesDrawer.getByRole('button', {
      name: 'Добавить стандарт FO',
    });
    await presetButton.click();

    await expect(
      rulesDrawer.getByText('Стандарт FO · максимум 5 одновременно'),
    ).toBeVisible();
    await expect(
      rulesDrawer.getByText('Стандарт FO · 2 сотрудника к 07:00'),
    ).toBeVisible();
    await expect(
      rulesDrawer.getByText('Стандарт FO добавлен: 2 правила.'),
    ).toBeVisible();

    await presetButton.click();
    await expect(
      rulesDrawer.getByText('Стандарт FO уже настроен. Ничего не изменено.'),
    ).toBeVisible();
    await expect(
      rulesDrawer.getByText('Стандарт FO · максимум 5 одновременно'),
    ).toHaveCount(1);
    await expect(
      rulesDrawer.getByText('Стандарт FO · 2 сотрудника к 07:00'),
    ).toHaveCount(1);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await rulesDrawer.getByTitle('Закрыть').click();
    expect(await toolsTrigger.boundingBox()).toEqual(triggerBefore);

    await toolsTrigger.click();
    const toolsDrawer = page.locator('aside').filter({
      has: page.getByText('Управление графиком', { exact: true }),
    });
    await expect(toolsDrawer).toBeVisible();
    await toolsDrawer.getByRole('button', { name: 'Проверить график' }).click();

    await expect(
      toolsDrawer.getByText('Почасовое покрытие FO'),
    ).toBeVisible();
    await expect(
      toolsDrawer.getByText('07:00 · 1 сотрудник'),
    ).toBeVisible();
    await expect(
      toolsDrawer.getByText('Ниже минимума 2'),
    ).toBeVisible();
    await expect(
      toolsDrawer.getByText('Правило: Стандарт FO · 2 сотрудника к 07:00 · v1'),
    ).toBeVisible();
    await expect(
      toolsDrawer.getByText('Ожидалось: 2 · фактически: 1 · 07:00'),
    ).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
