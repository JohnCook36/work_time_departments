import { expect, test, type Locator, type Page } from '@playwright/test';

const STORAGE_KEY = 'hotel-shift-planner:user:sticky-geometry-admin';
const LONG_DEPARTMENT = 'Очень длинное название первого синтетического отдела для проверки закрепления заголовка';
const EMPLOYEES_PER_DEPARTMENT = 25;
const TOLERANCE = 3;

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  expect(result, 'element has a browser bounding box').not.toBeNull();
  return result!;
}

function sameHorizontalGeometry(actual: { x: number; width: number }, expected: { x: number; width: number }) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(TOLERANCE);
}

async function seedPlanner(page: Page, role = 'SUPER_ADMIN') {
  await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
  await page.route('**/auth/me', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': route.request().headers()['origin'] || 'http://127.0.0.1:4173',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        id: 'sticky-geometry-admin', phoneE164: '+79990000000',
        employee: {
          id: 'sticky-admin-employee', displayName: 'Синтетический администратор',
          departmentId: 'department-1', employmentRate: 1,
          scheduleMode: 'FLEXIBLE', fixedStartTime: null, fixedEndTime: null,
        },
        memberships: [{ id: 'membership', role, departmentId: role === 'SUPER_ADMIN' ? null : 'department-1' }],
      }),
    });
  });
  const employees = Array.from({ length: EMPLOYEES_PER_DEPARTMENT * 2 }, (_, index) => ({
    id: `synthetic-${index + 1}`,
    name: `Тестовый сотрудник ${index + 1}`,
    departmentId: index < EMPLOYEES_PER_DEPARTMENT ? 'department-1' : 'department-2',
    employmentRate: 1,
  }));
  await page.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
    key: STORAGE_KEY,
    data: {
      departments: [
        { id: 'department-1', name: LONG_DEPARTMENT, kind: 'general' },
        { id: 'department-2', name: 'Второй тестовый отдел', kind: 'general' },
      ],
      employees, schedules: { '2026-09': {} }, wishes: {}, collapsedDepartments: [],
    },
  });
  await page.goto('/planner');
  if (role === 'SUPER_ADMIN' || role === 'DEPARTMENT_ADMIN') {
    await expect(page.getByText(LONG_DEPARTMENT, { exact: true })).toBeVisible();
  }
}

for (const role of ['EMPLOYEE', 'DEPUTY']) {
  test(`${role} cannot see management totals or other employees`, async ({ page }) => {
    await seedPlanner(page, role);
    await expect(page).toHaveURL(/\/my-schedule$/);
    await expect(page.locator('tfoot')).toHaveCount(0);
    await expect(page.getByText('Тестовый сотрудник 26', { exact: true })).toHaveCount(0);
    await expect(page.getByText(LONG_DEPARTMENT, { exact: true })).toHaveCount(0);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`sticky department, employee and monthly totals geometry at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedPlanner(page);

    const scroll = page.locator('table').locator('xpath=..');
    const headerEmployee = page.locator('thead th').first();
    const employee = page.getByText('Тестовый сотрудник 1', { exact: true }).locator('xpath=ancestor::tr').locator('td').first();
    const department = page.getByText(LONG_DEPARTMENT, { exact: true }).locator('xpath=..');
    const departmentCount = department.getByText(`${EMPLOYEES_PER_DEPARTMENT} сотрудников`, { exact: true });
    const footerEmployee = page.locator('tfoot td').first();

    const beforeScroll = await box(scroll);
    const initial = {
      header: await box(headerEmployee),
      employee: await box(employee),
      department: await box(department),
      count: await box(departmentCount),
      footer: await box(footerEmployee),
    };
    const dimensions = await scroll.evaluate(element => ({
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
    }));
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight + 300);
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth + 300);

    await scroll.evaluate((element, x) => { element.scrollLeft = x; }, viewport.width === 390 ? 960 : 500);
    await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(300);
    sameHorizontalGeometry(await box(headerEmployee), initial.header);
    sameHorizontalGeometry(await box(employee), initial.employee);
    sameHorizontalGeometry(await box(department), initial.department);
    sameHorizontalGeometry(await box(departmentCount), initial.count);
    sameHorizontalGeometry(await box(footerEmployee), initial.footer);
    const scrolledHeader = await box(department);
    const scrolledCount = await box(departmentCount);
    const visibleArea = await box(scroll);
    expect(scrolledHeader.x - (await box(employee)).x).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(scrolledHeader.x - (await box(employee)).x).toBeLessThanOrEqual(16);
    expect(scrolledCount.x + scrolledCount.width).toBeLessThanOrEqual(visibleArea.x + visibleArea.width + TOLERANCE);

    // Header, body and footer must all use the same table column track.
    const dayIndex = 19;
    const headerDay = await box(page.locator('thead th').nth(dayIndex));
    const bodyDay = await box(page.getByText('Тестовый сотрудник 1', { exact: true }).locator('xpath=ancestor::tr').locator('td').nth(dayIndex));
    const footerDay = await box(page.locator('tfoot td').nth(dayIndex));
    sameHorizontalGeometry(bodyDay, headerDay);
    sameHorizontalGeometry(footerDay, headerDay);

    for (const scrollTop of [0, Math.round(dimensions.scrollHeight / 2), dimensions.scrollHeight]) {
      await scroll.evaluate((element, y) => { element.scrollTop = y; }, scrollTop);
      const footer = await box(footerEmployee);
      const area = await box(scroll);
      expect(footer.y).toBeGreaterThanOrEqual(area.y - TOLERANCE);
      expect(footer.y + footer.height).toBeLessThanOrEqual(area.y + area.height + TOLERANCE);
      sameHorizontalGeometry(footer, initial.footer);
      expect(Math.abs(area.x - beforeScroll.x)).toBeLessThanOrEqual(TOLERANCE);
    }

    await scroll.evaluate(element => { element.scrollTop = 0; });
    await department.getByTitle('Свернуть отдел').click();
    await expect(page.getByText('Тестовый сотрудник 1', { exact: true })).toHaveCount(0);
    sameHorizontalGeometry(await box(department), initial.department);
    sameHorizontalGeometry(await box(departmentCount), initial.count);
    await department.getByTitle('Развернуть отдел').click();
    await expect(page.getByText('Тестовый сотрудник 1', { exact: true })).toBeVisible();
    sameHorizontalGeometry(await box(department), initial.department);
    sameHorizontalGeometry(await box(departmentCount), initial.count);

    const secondDepartment = page.getByText('Второй тестовый отдел', { exact: true }).locator('xpath=..');
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const secondBox = await box(secondDepartment);
    const scrolledArea = await box(scroll);
    expect(secondBox.x).toBeGreaterThanOrEqual(scrolledArea.x - TOLERANCE);
    expect(secondBox.x).toBeLessThanOrEqual(scrolledArea.x + 24);
  });
}
