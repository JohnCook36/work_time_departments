import { expect, test, type Page, type Route } from '@playwright/test';
import ExcelJS from 'exceljs';

const STORAGE_KEY = 'hotel-shift-planner:user:e2e-admin-user';

function periodKey(): string {
  const now = new Date();
  return now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
}

function state(options?: {
  departments?: Array<{ id: string; name: string; kind: 'general' }>;
  employees?: Array<{
    id: string;
    name: string;
    departmentId: string;
    employmentRate: 1 | 0.75 | 0.5;
  }>;
  schedule?: Record<string, Record<number, unknown>>;
}) {
  return {
    departments: options?.departments || [
      { id: 'department-1', name: 'Первый отдел', kind: 'general' },
    ],
    employees: options?.employees || [
      {
        id: 'employee-1',
        name: 'E2E Сотрудник',
        departmentId: 'department-1',
        employmentRate: 1,
      },
    ],
    schedules: { [periodKey()]: options?.schedule || {} },
    wishes: {},
    collapsedDepartments: [],
  };
}

async function seed(page: Page, data: ReturnType<typeof state>) {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    },
    { key: STORAGE_KEY, value: data },
  );
}

async function excelFile(rows: Array<Array<string>>) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('График');
  rows.forEach((row) => worksheet.addRow(row));
  return {
    name: 'synthetic-import.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  };
}

function employeeRow(page: Page, name = 'E2E Сотрудник') {
  return page.getByText(name, { exact: true }).locator('xpath=ancestor::tr');
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`day/night planner shows paid hours and stable totals at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
    const entry = (start: string, end: string, code?: 'N') => ({
      type: 'shift', shift: { start, end, ...(code ? { code } : {}) },
    });
    await seed(page, state({
      departments: [
        { id: 'department-1', name: 'Первый отдел', kind: 'general' },
        { id: 'department-2', name: 'Второй отдел', kind: 'general' },
      ],
      employees: Array.from({ length: 22 }, (_, index) => ({
        id: `employee-${index + 1}`,
        name: `E2E Сотрудник ${index + 1}`,
        departmentId: index < 11 ? 'department-1' : 'department-2',
        employmentRate: 1 as const,
      })),
      schedule: {
        'employee-1': {
          1: entry('08:00', '17:00'),
          2: entry('21:00', '06:00'),
          3: entry('22:00', '06:00'),
          4: entry('20:00', '08:00'),
          5: entry('05:00', '14:00'),
          6: entry('14:00', '23:00'),
          7: entry('20:00', '08:00', 'N'),
          8: { type: 'off' },
        },
        'employee-12': { 2: entry('08:00', '17:00') },
      },
    }));
    await page.goto('/planner');

    const row = employeeRow(page, 'E2E Сотрудник 1');
    const scroll = page.locator('table:has(tfoot)').locator('xpath=..');
    const toggle = page.getByRole('button', { name: 'День / ночь' });
    const before = await toggle.boundingBox();
    await expect(row.locator('td').nth(2)).toContainText('21:00–06:00');
    await expect(row.locator('td').nth(7)).toContainText('20:00–08:00');
    await toggle.click();
    const after = await toggle.boundingBox();
    expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(3);

    for (const [day, dayHours, nightHours, total] of [
      [1, 8, 0, 8], [2, 0, 8, 8], [3, 0, 7, 7],
      [4, 3, 8, 11], [5, 7, 1, 8], [6, 7, 1, 8], [7, 4, 8, 12],
    ]) {
      const cell = row.locator('td').nth(day);
      await expect(cell).toContainText(`Д ${dayHours}`);
      await expect(cell).toContainText(`Н ${nightHours}`);
      await expect(cell).toContainText(`Σ ${total}`);
    }
    await expect(row.locator('td').nth(8)).toContainText('OFF');
    await expect(row.locator('td').nth(9)).toContainText('·');
    await expect(row.locator('td').nth(31)).toHaveText('29');
    await expect(row.locator('td').nth(32)).toHaveText('33');
    await expect(row.locator('td').nth(33)).toHaveText('62');
    const footer = page.locator('tfoot tr');
    await expect(footer.locator('td').nth(2)).toHaveText('16');
    await expect(footer.locator('td').nth(31)).toHaveText('37');
    await expect(footer.locator('td').nth(32)).toHaveText('33');
    await expect(footer.locator('td').nth(33)).toHaveText('70');

    const employeeColumn = row.locator('td').first();
    const originalX = (await employeeColumn.boundingBox())!.x;
    const dimensions = await scroll.evaluate(element => ({
      horizontal: element.scrollWidth - element.clientWidth,
      vertical: element.scrollHeight - element.clientHeight,
    }));
    expect(dimensions.horizontal).toBeGreaterThan(300);
    expect(dimensions.vertical).toBeGreaterThan(100);
    await scroll.evaluate(element => { element.scrollLeft = 650; });
    await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(300);
    expect(Math.abs((await employeeColumn.boundingBox())!.x - originalX)).toBeLessThanOrEqual(3);
    await scroll.evaluate(element => { element.scrollTop = 400; });
    const footerBox = await footer.locator('td').first().boundingBox();
    const scrollBox = await scroll.boundingBox();
    expect(footerBox!.y).toBeGreaterThanOrEqual(scrollBox!.y - 3);
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(scrollBox!.y + scrollBox!.height + 3);
    await expect(toggle).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole('button', { name: 'График', exact: true }).click();
    await expect(row.locator('td').nth(2)).toContainText('21:00–06:00');
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': route.request().headers().origin || 'http://127.0.0.1:4173',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        id: 'e2e-admin-user',
        phoneE164: '+79990000000',
        employee: {
          id: 'e2e-admin-employee',
          displayName: 'E2E Администратор',
          departmentId: 'department-1',
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
        },
        memberships: [
          {
            id: 'e2e-admin-membership',
            role: 'SUPER_ADMIN',
            departmentId: null,
          },
        ],
      }),
    });
  });
});

test('fixed 5/2 edit and schedule tools remain usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, state());
  await page.goto('/');
  await employeeRow(page).getByTitle('Редактировать сотрудника').click();
  await page.getByRole('combobox').nth(2).selectOption('fixed-weekdays');
  await page.getByLabel('Начало рабочего дня').fill('09:00');
  await page.getByLabel('Окончание рабочего дня').fill('18:00');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Управление графиком' }).click();
  await expect(page.getByRole('button', { name: 'Сохранить график 5/2' })).toBeDisabled();
  await expect(page.getByText('Управление графиком', { exact: true }).last()).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`publication history drawer stays usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seed(page, state());
    await page.goto('/planner');

    const trigger = page.getByRole('button', { name: 'Управление графиком' });
    const before = await trigger.boundingBox();
    await trigger.click();

    expect(await trigger.boundingBox()).toEqual(before);
    await expect(page.getByText('Публикация и версии', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Опубликовать версию' }),
    ).toBeDisabled();
    await expect(
      page.getByText('История публикаций доступна в серверном режиме.'),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Выберите версию в истории, чтобы открыть сохранённый снимок.',
      ),
    ).toBeVisible();

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`prepublish validation shows hard/soft sections and navigates to a cell at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
    const version = '2026-09-10T10:00:00.000Z';

    async function reply(route: Route, body: unknown, status = 200) {
      await route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:4174',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        },
        body: JSON.stringify(body),
      });
    }

    await page.route('**/departments/manageable', route => reply(route, [
      {
        id: 'department-1',
        name: 'Front Office',
        kind: 'FO',
        position: 0,
        updatedAt: version,
      },
    ]));
    await page.route('**/wishes/department?**', route => reply(route, []));
    await page.route('**/schedule-data/department?**', route => reply(route, {
      period: { year: 2026, month: 9 },
      schedule: { id: 'schedule-1', updatedAt: version },
      department: { id: 'department-1', name: 'Front Office', kind: 'FO' },
      employees: [
        {
          id: 'employee-1',
          displayName: 'Проверка E2E',
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
          position: 0,
          updatedAt: version,
        },
      ],
      shifts: [
        {
          id: 'shift-1',
          employeeId: 'employee-1',
          date: '2026-09-07',
          code: null,
          startTime: '08:00',
          endTime: '08:00',
          isOff: false,
          updatedAt: version,
        },
      ],
    }));
    await page.route('**/schedule-data/department/publications?**', route =>
      reply(route, []),
    );
    await page.route('**/schedule-data/department/validation?**', route =>
      reply(route, {
        departmentId: 'department-1',
        period: { year: 2026, month: 9 },
        rulesVersion: 'schedule-publication-rules-v1',
        canPublish: false,
        violations: [
          {
            severity: 'hard',
            code: 'ZERO_DURATION_SHIFT',
            message: 'Время начала и окончания рабочей смены не может совпадать.',
            employeeId: 'employee-1',
            shiftId: 'shift-1',
            date: '2026-09-07',
          },
        ],
      }),
    );

    await page.goto('http://127.0.0.1:4174/planner');
    await expect(page.getByText('Проверка E2E', { exact: true })).toBeVisible();

    await page.getByTitle('Свернуть отдел').click();
    await expect(page.getByText('Проверка E2E', { exact: true })).toHaveCount(0);

    const trigger = page.getByRole('button', { name: 'Управление графиком' });
    const before = await trigger.boundingBox();
    await trigger.click();
    expect(await trigger.boundingBox()).toEqual(before);
    await page.getByRole('button', { name: 'Проверить график' }).click();

    await expect(page.getByText('Жёсткие нарушения · 1')).toBeVisible();
    await expect(page.getByText('Предупреждения · 0')).toBeVisible();
    await expect(
      page.getByText('Время начала и окончания рабочей смены не может совпадать.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Опубликовать версию' }),
    ).toBeDisabled();

    await page.getByRole('button', { name: 'Перейти к ячейке' }).click();

    const target = page.locator('#schedule-cell-employee-1-7');
    await expect(page.getByText('Проверка E2E', { exact: true })).toBeVisible();
    await expect(target).toBeFocused();
    await expect(target).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  });
}

test('department + employee + 15:00-23:00 produces D 6 / N 1 / total 7', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Отделы' }).click();
  await page.getByPlaceholder('Название отдела').fill('E2E Отдел');
  await page.getByRole('button', { name: 'Создать отдел' }).click();
  await page.getByTitle('Закрыть').click();

  await page.getByRole('button', { name: 'Новый сотрудник' }).click();
  const employeeName = page.getByPlaceholder('Например, Иван Иванов');
  await employeeName.fill('Новый E2E');
  await page.getByRole('combobox').first().selectOption({
    label: 'E2E Отдел',
  });
  await page.getByRole('button', { name: 'Добавить сотрудника', exact: true }).click();

  const row = employeeRow(page, 'Новый E2E');
  await row.locator('td').nth(1).click();
  await page.getByRole('button', { name: '15:00–23:00' }).click();
  await page.getByRole('button', { name: /Сохранить смену/ }).click();
  await page.getByRole('button', { name: 'День / ночь' }).click();

  await expect(row.getByText('Д 6')).toBeVisible();
  await expect(row.getByText('Н 1')).toBeVisible();
  await expect(row.getByText('Σ 7')).toBeVisible();
});

test('employee drag to another department survives reload', async ({ page }) => {
  await seed(
    page,
    state({
      departments: [
        { id: 'department-1', name: 'Первый отдел', kind: 'general' },
        { id: 'department-2', name: 'Второй отдел', kind: 'general' },
      ],
    }),
  );
  await page.goto('/');

  const handle = employeeRow(page).getByTitle('Перетащить сотрудника');
  const target = page
    .getByText('Второй отдел', { exact: true })
    .locator('xpath=ancestor::td');

  const sourceBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error('Drag source or target is not visible');
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 12,
    sourceBox.y + sourceBox.height / 2 + 12,
    { steps: 4 },
  );
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 14 },
  );
  await page.mouse.up();

  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || '{}').employees?.[0]?.departmentId,
        STORAGE_KEY,
      ),
    )
    .toBe('department-2');

  await page.reload();
  await expect(employeeRow(page)).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || '{}').employees[0].departmentId,
      STORAGE_KEY,
    ),
  ).toBe('department-2');
});

test('night shift shows working time instead of internal N code', async ({ page }) => {
  await seed(
    page,
    state({
      schedule: {
        'employee-1': {
          1: {
            type: 'shift',
            shift: { start: '20:00', end: '08:00', code: 'N' },
          },
        },
      },
    }),
  );
  await page.goto('/');

  const row = employeeRow(page);
  const nightCell = row.locator('td').nth(1);

  await expect(nightCell).toContainText('20:00–08:00');
  await expect(nightCell).not.toContainText(/^N$/);
});

test('shift editor saves the 08:00-17:00 preset into the cell', async ({ page }) => {
  await seed(page, state());
  await page.goto('/');

  const row = employeeRow(page);
  await row.locator('td').nth(1).click();
  await expect(page.getByText('Смена сотрудника')).toBeVisible();
  await page.getByRole('button', { name: '08:00–17:00' }).click();
  await page.getByRole('button', { name: /Сохранить смену/ }).click();

  await expect(row.getByTitle('08:00–17:00')).toHaveText('08:00–17:00');
});

test('Excel preview protects a cell and allows confirmed overwrite', async ({ page }) => {
  await seed(
    page,
    state({
      schedule: {
        'employee-1': {
          1: { type: 'shift', shift: { start: '08:00', end: '17:00' } },
        },
      },
    }),
  );
  await page.goto('/');

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('График');
  worksheet.addRow(['Сотрудник', '1']);
  worksheet.addRow(['E2E Сотрудник', '15:00-23:00']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await page.getByRole('button', { name: 'Управление графиком' }).click();
  const input = page.locator('input[type="file"]');

  await input.setInputFiles({
    name: 'import.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await expect(page.getByText('Предпросмотр импорта')).toBeVisible();
  await expect(page.getByText('Конфликтов с текущим графиком')).toBeVisible();
  await page.getByRole('button', { name: 'Применить импорт' }).click();
  const protectedImportDialog = page.getByRole('dialog', { name: 'Сообщение' });
  await expect(protectedImportDialog).toContainText('Импортировано смен: 0');
  await expect(protectedImportDialog).toContainText(
    'Защищено заполненных ячеек: 1',
  );
  await protectedImportDialog.getByRole('button', { name: 'Понятно' }).click();
  await expect(employeeRow(page).getByTitle('08:00–17:00')).toBeVisible();

  await input.setInputFiles({
    name: 'import.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await page
    .getByRole('checkbox', { name: /Перезаписывать заполненные ячейки/ })
    .check();
  await page.getByRole('button', { name: 'Применить импорт' }).click();
  const overwriteDialog = page.getByRole('dialog', { name: 'Сообщение' });
  await expect(overwriteDialog).toContainText('Импортировано смен: 1');
  await overwriteDialog.getByRole('button', { name: 'Понятно' }).click();

  await expect(employeeRow(page).getByTitle('15:00–23:00')).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Excel import acceptance for multiple employees and warnings at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
    await seed(page, state({
      departments: [
        { id: 'department-1', name: 'Первый отдел', kind: 'general' },
        { id: 'department-2', name: 'Второй отдел', kind: 'general' },
      ],
      employees: [
        { id: 'alice', name: 'Алина E2E', departmentId: 'department-1', employmentRate: 1 },
        { id: 'duplicate-a', name: 'Дубль E2E', departmentId: 'department-1', employmentRate: 1 },
        { id: 'bob', name: 'Борис E2E', departmentId: 'department-2', employmentRate: 1 },
        { id: 'duplicate-b', name: 'Дубль E2E', departmentId: 'department-2', employmentRate: 1 },
      ],
      schedule: { alice: { 1: { type: 'shift', shift: { start: '07:00', end: '16:00' } } } },
    }));
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Управление графиком' });
    const before = await trigger.boundingBox();
    await trigger.click();
    expect(await trigger.boundingBox()).toEqual(before);
    const file = await excelFile([
      ['Сотрудник', '1', '2', '3', '4', '5', '6'],
      ['Борис E2E', '', '20:00-08:00', 'OFF', '', '', ''],
      ['Неизвестный E2E', '08:00-17:00', '', '', '', '', ''],
      ['Дубль E2E', '', '', '', '08:00-17:00', '', ''],
      ['Алина E2E', '09:00-18:00', '08:00-17:00', '25:00-17:00', '08:00', 'ошибочный текст', ''],
    ]);
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(file);
    const preview = page.locator('aside').filter({ hasText: 'Предпросмотр импорта' });
    await expect(preview).toBeVisible();
    await expect(preview.getByText('Не найдены в текущем графике')).toBeVisible();
    await expect(preview.getByText('Неоднозначное совпадение сотрудников')).toBeVisible();
    await expect(preview.getByText('Некорректные смены', { exact: true })).toBeVisible();
    await expect(preview).toContainText('25:00-17:00');
    await expect(preview).toContainText('08:00');
    await expect(preview).toContainText('ошибочный текст');
    await expect(preview).toContainText('Неизвестный E2E');
    await expect(preview).toContainText('Дубль E2E');
    await expect(preview).toContainText('Конфликтов с текущим графиком');
    const overwrite = preview.getByRole('checkbox', { name: /Перезаписывать заполненные ячейки/ });
    await expect(overwrite).not.toBeChecked();
    await overwrite.scrollIntoViewIfNeeded();
    await expect(overwrite).toBeInViewport();
    const apply = preview.getByRole('button', { name: 'Применить импорт' });
    await apply.scrollIntoViewIfNeeded();
    await expect(apply).toBeInViewport();
    expect(await preview.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
    expect(await trigger.boundingBox()).toEqual(before);
    await apply.click();
    const result = page.getByRole('dialog', { name: 'Сообщение' });
    await expect(result).toContainText('Импортировано смен: 3');
    await expect(result).toContainText('Защищено заполненных ячеек: 1');
    await result.getByRole('button', { name: 'Понятно' }).click();
    await expect(employeeRow(page, 'Алина E2E').locator('td').nth(1)).toContainText('07:00–16:00');
    await expect(employeeRow(page, 'Алина E2E').locator('td').nth(2)).toContainText('08:00–17:00');
    await expect(employeeRow(page, 'Борис E2E').locator('td').nth(2)).toContainText('20:00–08:00');
    await expect(employeeRow(page, 'Борис E2E').locator('td').nth(3)).toContainText('OFF');
    await expect(employeeRow(page, 'Дубль E2E').first().locator('td').nth(4))
      .not.toContainText('08:00–17:00');
    expect(await trigger.boundingBox()).toEqual(before);

    await input.setInputFiles(await excelFile([
      ['Сотрудник', '1', '2'],
      ['Алина E2E', '15:00-23:00', ''],
    ]));
    const overwritePreview = page.locator('aside').filter({ hasText: 'Предпросмотр импорта' });
    await overwritePreview.getByRole('checkbox', { name: /Перезаписывать заполненные ячейки/ }).check();
    await overwritePreview.getByRole('button', { name: 'Применить импорт' }).click();
    await expect(result).toContainText('Импортировано смен: 1');
    await result.getByRole('button', { name: 'Понятно' }).click();
    await expect(employeeRow(page, 'Алина E2E').locator('td').nth(1)).toContainText('15:00–23:00');
    await expect(employeeRow(page, 'Алина E2E').locator('td').nth(2)).toContainText('08:00–17:00');
    await expect(employeeRow(page, 'Борис E2E').locator('td').nth(3)).toContainText('OFF');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`server-backed Excel import is atomic and survives reload at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
    await page.addInitScript(({ ownKey }) => {
      localStorage.setItem(ownKey, JSON.stringify({
        departments: [{ id: 'stale-department', name: 'Старый локальный отдел', kind: 'general' }],
        employees: [{ id: 'stale-employee', name: 'Старый локальный сотрудник', departmentId: 'stale-department' }],
        schedules: {}, wishes: {}, collapsedDepartments: [],
      }));
      localStorage.setItem('hotel-shift-planner:user:other-account', JSON.stringify({
        departments: [{ id: 'foreign-department', name: 'Чужой отдел', kind: 'general' }],
        employees: [{ id: 'foreign-employee', name: 'Чужой сотрудник', departmentId: 'foreign-department' }],
        schedules: {}, wishes: {}, collapsedDepartments: [],
      }));
    }, { ownKey: STORAGE_KEY });

    const timestamp = '2026-09-10T10:00:00.000Z';
    type ServerShift = {
      id: string; employeeId: string; date: string; code: string | null;
      startTime: string | null; endTime: string | null; isOff: boolean; updatedAt: string;
    };
    type Change = {
      employeeId: string; day: number; type: 'shift' | 'off' | 'empty';
      startTime?: string; endTime?: string; code?: string | null; expectedUpdatedAt: string | null;
    };
    const shifts: Record<string, ServerShift[]> = {
      'department-1': [{
        id: 'shift-alice-1', employeeId: 'alice', date: '2026-09-01', code: null,
        startTime: '07:00', endTime: '16:00', isOff: false, updatedAt: timestamp,
      }],
      'department-2': [{
        id: 'shift-bob-2', employeeId: 'bob', date: '2026-09-02', code: null,
        startTime: null, endTime: null, isOff: true, updatedAt: timestamp,
      }],
    };
    const batchRequests: Array<{ year: number; month: number; changes: Change[] }> = [];
    async function respond(route: Route, data: unknown, status = 200) {
      await route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:4174',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
        },
        body: JSON.stringify(data),
      });
    }
    await page.route('**/departments/manageable', (route) => respond(route, [
      { id: 'department-1', name: 'Первый отдел', kind: 'GENERAL', position: 0, updatedAt: timestamp },
      { id: 'department-2', name: 'Второй отдел', kind: 'GENERAL', position: 1, updatedAt: timestamp },
    ]));
    await page.route('**/wishes/department?**', (route) => respond(route, []));
    await page.route('**/schedule-data/department?**', (route) => {
      const url = new URL(route.request().url());
      const departmentId = url.searchParams.get('departmentId')!;
      const employeeId = departmentId === 'department-1' ? 'alice' : 'bob';
      return respond(route, {
        period: { year: Number(url.searchParams.get('year')), month: Number(url.searchParams.get('month')) },
        schedule: { id: 'schedule-' + departmentId, updatedAt: timestamp },
        department: { id: departmentId, name: departmentId === 'department-1' ? 'Первый отдел' : 'Второй отдел', kind: 'GENERAL' },
        employees: [{
          id: employeeId, displayName: employeeId === 'alice' ? 'Алина E2E' : 'Борис E2E',
          employmentRate: 1, scheduleMode: 'FLEXIBLE', fixedStartTime: null,
          fixedEndTime: null, position: 0, updatedAt: timestamp,
        }],
        shifts: shifts[departmentId],
      });
    });
    await page.route('**/schedule-data/planner/entries', async (route) => {
      if (route.request().method() === 'OPTIONS') return respond(route, {}, 204);
      const body = route.request().postDataJSON() as { year: number; month: number; changes: Change[] };
      batchRequests.push(body);
      if (batchRequests.length === 1) {
        return respond(route, { message: 'Конфликт версии графика' }, 409);
      }
      for (const change of body.changes) {
        const departmentId = change.employeeId === 'alice' ? 'department-1' : 'department-2';
        const date = '2026-09-' + String(change.day).padStart(2, '0');
        const existing = shifts[departmentId].find((shift) => shift.employeeId === change.employeeId && shift.date === date);
        if (existing) {
          existing.startTime = change.startTime || null;
          existing.endTime = change.endTime || null;
          existing.isOff = change.type === 'off';
        } else {
          shifts[departmentId].push({
            id: 'shift-' + change.employeeId + '-' + change.day,
            employeeId: change.employeeId, date, code: change.code || null,
            startTime: change.startTime || null, endTime: change.endTime || null,
            isOff: change.type === 'off', updatedAt: timestamp,
          });
        }
      }
      return respond(route, { status: 'ok', applied: body.changes.length, schedule: null });
    });

    await page.goto('http://127.0.0.1:4174/');
    await expect(employeeRow(page, 'Алина E2E')).toBeVisible();
    await expect(employeeRow(page, 'Борис E2E')).toBeVisible();
    await expect(page.getByText('Старый локальный сотрудник')).toHaveCount(0);
    await expect(page.getByText('Чужой сотрудник')).toHaveCount(0);
    const trigger = page.getByRole('button', { name: 'Управление графиком' });
    const before = await trigger.boundingBox();
    await trigger.click();
    await expect(page.getByRole('button', { name: 'Импорт Excel' })).toBeEnabled();
    await page.locator('input[type="file"]').setInputFiles(await excelFile([
      ['Сотрудник', '1', '2', '3'],
      ['Борис E2E', '', '20:00-08:00', ''],
      ['Алина E2E', '08:00-17:00', '', 'OFF'],
    ]));
    const preview = page.locator('aside').filter({ hasText: 'Предпросмотр импорта' });
    await expect(preview).toBeVisible();
    await preview.getByRole('checkbox', { name: /Перезаписывать заполненные ячейки/ }).check();
    expect(await preview.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
    await preview.getByRole('button', { name: 'Применить импорт' }).click();
    const feedback = page.getByRole('dialog', { name: 'Сообщение' });
    await expect(feedback).toContainText('Не удалось применить импорт: Конфликт версии графика');
    expect(batchRequests).toHaveLength(1);
    expect(batchRequests[0].changes).toEqual([
      { employeeId: 'bob', day: 2, type: 'shift', startTime: '20:00', endTime: '08:00', code: null, expectedUpdatedAt: timestamp },
      { employeeId: 'alice', day: 1, type: 'shift', startTime: '08:00', endTime: '17:00', code: null, expectedUpdatedAt: timestamp },
      { employeeId: 'alice', day: 3, type: 'off', expectedUpdatedAt: null },
    ]);
    expect(batchRequests[0].year).toBe(2026);
    expect(batchRequests[0].month).toBe(9);
    await feedback.getByRole('button', { name: 'Понятно' }).click();
    await expect(employeeRow(page, 'Алина E2E').locator('td').nth(1)).toContainText('07:00–16:00');
    await expect(employeeRow(page, 'Борис E2E').locator('td').nth(2)).toContainText('OFF');
    await expect(employeeRow(page, 'Алина E2E').locator('td').nth(3)).not.toContainText('OFF');
    await expect(preview).toBeVisible();
    await preview.getByRole('button', { name: 'Применить импорт' }).click();
    await expect(feedback).toContainText('Импортировано смен: 3');
    expect(batchRequests).toHaveLength(2);
    await feedback.getByRole('button', { name: 'Понятно' }).click();
    await expect(employeeRow(page, 'Алина E2E').locator('td').nth(1)).toContainText('08:00–17:00');
    await expect(employeeRow(page, 'Алина E2E').locator('td').nth(3)).toContainText('OFF');
    await expect(employeeRow(page, 'Борис E2E').locator('td').nth(2)).toContainText('20:00–08:00');
    expect(await trigger.boundingBox()).toEqual(before);
    await page.reload();
    await expect(employeeRow(page, 'Алина E2E').locator('td').nth(1)).toContainText('08:00–17:00');
    await expect(employeeRow(page, 'Борис E2E').locator('td').nth(2)).toContainText('20:00–08:00');
    await expect(page.getByText('Старый локальный сотрудник')).toHaveCount(0);
    await expect(page.getByText('Чужой сотрудник')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('employment rate changes the weekly norm', async ({ page }) => {
  const weekSchedule: Record<number, unknown> = {};
  for (const day of [7, 8, 9, 10, 11]) {
    weekSchedule[day] = {
      type: 'shift',
      shift: { start: '08:00', end: '17:00' },
    };
  }
  await seed(
    page,
    state({ schedule: { 'employee-1': weekSchedule } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'День / ночь' }).click();

  const normRow = page
    .getByRole('cell', { name: 'E2E Сотрудник' })
    .locator('xpath=ancestor::tr');
  await expect(normRow.getByText('40 / 40')).toBeVisible();
  await normRow.getByTitle('Ставка сотрудника').selectOption('0.5');
  await expect(normRow.getByText('40 / 20')).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`server-backed weekly norm rate persists through reload at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
    await page.addInitScript(key => {
      localStorage.setItem(key, JSON.stringify({
        departments: [{ id: 'stale', name: 'Устаревший отдел', kind: 'general' }],
        employees: [{ id: 'stale-employee', name: 'Устаревший сотрудник', departmentId: 'stale', employmentRate: 0.5 }],
        schedules: {}, wishes: {}, collapsedDepartments: [],
      }));
    }, STORAGE_KEY);

    let rate: 1 | 0.75 | 0.5 = 1;
    let version = '2026-09-10T10:00:00.000Z';
    let snapshotReads = 0;
    const updates: Array<{ employmentRate: number; expectedUpdatedAt: string }> = [];
    const shifts = [7, 8, 9, 10, 11].map(day => ({
      id: `shift-day-${day}`, employeeId: 'employee-1',
      date: `2026-09-${String(day).padStart(2, '0')}`, code: null,
      startTime: '08:00', endTime: '17:00', isOff: false, updatedAt: version,
    }));
    shifts.push({ id: 'shift-night-14', employeeId: 'employee-1', date: '2026-09-14',
      code: null, startTime: '20:00', endTime: '08:00', isOff: false, updatedAt: version });
    shifts.push({ id: 'shift-n-15', employeeId: 'employee-1', date: '2026-09-15',
      code: 'N', startTime: '20:00', endTime: '08:00', isOff: false, updatedAt: version });
    shifts.push({ id: 'shift-off-16', employeeId: 'employee-1', date: '2026-09-16',
      code: null, startTime: null, endTime: null, isOff: true, updatedAt: version });

    const reply = (route: Route, body: unknown, status = 200) => route.fulfill({
      status, contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:4174',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
      },
      body: JSON.stringify(body),
    });
    await page.route('**/departments/manageable', route => reply(route, [
      { id: 'department-1', name: 'Тестовый отдел', kind: 'GENERAL', position: 0, updatedAt: version },
    ]));
    await page.route('**/wishes/department?**', route => reply(route, []));
    await page.route('**/schedule-data/department?**', route => {
      snapshotReads++;
      return reply(route, {
        period: { year: 2026, month: 9 },
        schedule: { id: 'schedule-1', updatedAt: version },
        department: { id: 'department-1', name: 'Тестовый отдел', kind: 'GENERAL' },
        employees: [
          { id: 'employee-1', displayName: 'Норма E2E 1', employmentRate: rate,
            scheduleMode: 'FLEXIBLE', fixedStartTime: null, fixedEndTime: null,
            position: 0, updatedAt: version },
          { id: 'employee-2', displayName: 'Норма E2E 2', employmentRate: 1,
            scheduleMode: 'FLEXIBLE', fixedStartTime: null, fixedEndTime: null,
            position: 1, updatedAt: version },
        ],
        shifts,
      });
    });
    await page.route('**/employees/employee-1', route => {
      if (route.request().method() === 'OPTIONS') return reply(route, {}, 204);
      const body = route.request().postDataJSON() as { employmentRate: 1 | 0.75 | 0.5; expectedUpdatedAt: string };
      updates.push(body);
      if (body.expectedUpdatedAt !== version) return reply(route, { message: 'Conflict' }, 409);
      rate = body.employmentRate;
      version = `2026-09-10T10:00:0${updates.length}.000Z`;
      return reply(route, { id: 'employee-1', displayName: 'Норма E2E 1', employmentRate: rate,
        scheduleMode: 'FLEXIBLE', fixedStartTime: null, fixedEndTime: null,
        departmentId: 'department-1', position: 0, isActive: true, isLinked: false,
        updatedAt: version });
    });

    await page.goto('http://127.0.0.1:4174/planner');
    await expect(page.getByText('Норма E2E 1', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Устаревший сотрудник')).toHaveCount(0);
    await page.getByRole('button', { name: 'День / ночь' }).click();
    const panel = page.getByText('Недельная норма', { exact: true }).locator('xpath=ancestor::section');
    const row = panel.getByRole('cell', { name: 'Норма E2E 1' }).locator('xpath=ancestor::tr');
    const weeklyScroll = panel.locator('table').locator('xpath=..');
    const rateSelect = row.getByTitle('Ставка сотрудника');
    await expect(panel.getByRole('columnheader', { name: 'Сотрудник' })).toBeVisible();
    await expect(panel.getByRole('columnheader', { name: 'Ставка' })).toBeVisible();
    await expect(panel.getByRole('columnheader', { name: 'Неделя 7–13' })).toBeVisible();
    await expect(panel.getByRole('cell', { name: 'Норма E2E 2' })).toBeVisible();
    await expect(rateSelect).toHaveValue('1');
    await expect(row.locator('td').nth(2)).toContainText('0 / 32');
    await expect(row.locator('td').nth(3)).toContainText('40 / 40');
    await expect(row.locator('td').nth(3)).toContainText('0 ч');
    await expect(row.locator('td').nth(4)).toContainText('23 / 40');
    await expect(row.locator('td').nth(4)).toContainText('-17 ч');
    await expect(row.locator('td').nth(6)).toContainText('0 / 24');
    await panel.scrollIntoViewIfNeeded();
    const panelY = await panel.evaluate(element => element.getBoundingClientRect().top + scrollY);
    const weeklyDimensions = await weeklyScroll.evaluate(element => ({
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
    }));
    if (viewport.width === 390) {
      expect(weeklyDimensions.scrollWidth).toBeGreaterThan(weeklyDimensions.clientWidth + 300);
      const beforeX = (await row.locator('td').first().boundingBox())!.x;
      await weeklyScroll.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      await expect.poll(() => weeklyScroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(300);
      expect(Math.abs((await row.locator('td').first().boundingBox())!.x - beforeX)).toBeLessThanOrEqual(3);
      await expect(panel.getByRole('columnheader', { name: 'Неделя 28–30' })).toBeInViewport();
      await weeklyScroll.evaluate(element => { element.scrollLeft = 0; });
    } else {
      const plannerScroll = page.locator('table:has(tfoot)').locator('xpath=..');
      await plannerScroll.evaluate(element => { element.scrollLeft = 500; });
      await expect.poll(() => plannerScroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(300);
    }

    for (const [nextRate, fullWeek, secondWeek, firstWeek, lastWeek, fullDelta, secondDelta] of [
      [0.75, '40 / 30', '23 / 30', '0 / 24', '0 / 18', '+10 ч', '-7 ч'],
      [0.5, '40 / 20', '23 / 20', '0 / 16', '0 / 12', '+20 ч', '+3 ч'],
      [1, '40 / 40', '23 / 40', '0 / 32', '0 / 24', '0 ч', '-17 ч'],
    ] as const) {
      await rateSelect.selectOption(String(nextRate));
      await expect.poll(() => updates.length).toBeGreaterThanOrEqual(
        nextRate === 0.75 ? 1 : nextRate === 0.5 ? 2 : 3,
      );
      await expect(rateSelect).toHaveValue(String(nextRate));
      await expect(row.locator('td').nth(2)).toContainText(firstWeek);
      await expect(row.locator('td').nth(3)).toContainText(fullWeek);
      await expect(row.locator('td').nth(3)).toContainText(fullDelta);
      await expect(row.locator('td').nth(4)).toContainText(secondWeek);
      await expect(row.locator('td').nth(4)).toContainText(secondDelta);
      await expect(row.locator('td').nth(6)).toContainText(lastWeek);
      await page.reload();
      await page.getByRole('button', { name: 'День / ночь' }).click();
      await expect(panel).toBeVisible();
      await expect(rateSelect).toHaveValue(String(nextRate));
      await expect(row.locator('td').nth(3)).toContainText(fullWeek);
      await expect(page.getByText('Устаревший сотрудник')).toHaveCount(0);
    }
    expect(updates).toEqual([
      { employmentRate: 0.75, expectedUpdatedAt: '2026-09-10T10:00:00.000Z' },
      { employmentRate: 0.5, expectedUpdatedAt: '2026-09-10T10:00:01.000Z' },
      { employmentRate: 1, expectedUpdatedAt: '2026-09-10T10:00:02.000Z' },
    ]);
    expect(snapshotReads).toBeGreaterThanOrEqual(7);
    expect(Math.abs((await panel.evaluate(element => element.getBoundingClientRect().top + scrollY)) - panelY)).toBeLessThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`weekly Excel download and stable drawer at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
    const data = state();
    data.schedules = {
      '2026-08': { 'employee-1': { 31: { type: 'shift', shift: { start: '20:00', end: '08:00', code: 'N' } } } },
      '2026-09': { 'employee-1': {
        1: { type: 'shift', shift: { start: '08:00', end: '17:00', code: 'E' } },
        2: { type: 'off' },
        7: { type: 'shift', shift: { start: '08:00', end: '17:00' } },
      } },
    };
    await seed(page, data);
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Управление графиком' });
    const before = await trigger.boundingBox();
    await trigger.click();
    expect(await trigger.boundingBox()).toEqual(before);
    const select = page.getByLabel('Период экспорта');
    await expect(select).toHaveValue('month');
    const exportButton = page.getByRole('button', { name: 'Экспорт Excel' });
    await exportButton.hover();
    await expect.poll(async () => exportButton.evaluate((element) => getComputedStyle(element).transform)).toBe('matrix(1, 0, 0, 1, 0, -1)');
    const buttonBefore = await exportButton.boundingBox();
    await select.selectOption('week:2026-08-31');
    await exportButton.hover();
    await expect.poll(() => exportButton.boundingBox()).toEqual(buttonBefore);
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('work-time-departments_week-2026-08-31_to_2026-09-06.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile((await download.path())!);
    const sheet = workbook.getWorksheet('График')!;
    expect(sheet.columnCount).toBe(12);
    expect(sheet.getCell('B1').value).toBe('Пн\n31.08.2026');
    expect(sheet.getCell('H1').value).toBe('Вс\n06.09.2026');
    expect(sheet.getCell('B3').value).toBe('20:00-08:00');
    expect(sheet.getCell('C3').value).toBe('08:00-17:00');
    expect(sheet.getCell('D3').value).toBe('OFF');
    expect(sheet.getCell('K3').value).toBe(20);
    expect(workbook.getWorksheet('Часы')!.getCell('K3').value).toBe(20);
    await expect(exportButton).toBeEnabled();
    await exportButton.hover();
    await expect.poll(() => exportButton.boundingBox()).toEqual(buttonBefore);
    await expect(select).toBeInViewport();
    await expect(exportButton).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`weekly-excel-${viewport.width}.png`) });

    await select.selectOption('month');
    const monthlyDownloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const monthly = await monthlyDownloadPromise;
    expect(monthly.suggestedFilename()).toBe('work-time-departments_2026-09.xlsx');
    const monthlyWorkbook = new ExcelJS.Workbook();
    await monthlyWorkbook.xlsx.readFile((await monthly.path())!);
    expect(monthlyWorkbook.getWorksheet('График')!.columnCount).toBe(35);
    await page.getByTitle('Закрыть', { exact: true }).click();
    expect(await trigger.boundingBox()).toEqual(before);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`print popup contains the selected calendar period at ${viewport.width}px`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
    await context.addInitScript(() => {
      window.print = () => { document.documentElement.dataset.printCalled = 'true'; };
    });

    const data = state({
      departments: [
        { id: 'department-2', name: 'Второй отдел', kind: 'general' },
        { id: 'department-1', name: 'Первый отдел', kind: 'general' },
      ],
      employees: [
        { id: 'employee-1', name: 'Алина E2E', departmentId: 'department-2', employmentRate: 1 },
        { id: 'employee-2', name: 'Борис E2E', departmentId: 'department-1', employmentRate: 1 },
      ],
    });
    data.schedules = {
      '2026-08': { 'employee-1': {
        31: { type: 'shift', shift: { start: '20:00', end: '08:00', code: 'N' } },
      } },
      '2026-09': { 'employee-1': {
        1: { type: 'shift', shift: { start: '08:00', end: '17:00', code: 'E' } },
        2: { type: 'off' },
        3: { type: 'error', error: 'Тестовая ошибка' },
        7: { type: 'shift', shift: { start: '09:00', end: '17:00' } },
        28: { type: 'shift', shift: { start: '08:00', end: '17:00' } },
      } },
      '2026-10': { 'employee-1': {
        1: { type: 'shift', shift: { start: '10:00', end: '18:00' } },
        4: { type: 'off' },
      } },
    };
    await seed(page, data);
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Управление графиком' });
    const triggerBefore = await trigger.boundingBox();
    await trigger.click();
    expect(await trigger.boundingBox()).toEqual(triggerBefore);
    const printButton = page.getByRole('button', { name: 'Печать' });
    const select = printButton.locator('xpath=..').getByRole('combobox');
    await expect(select).toBeInViewport();
    await expect(printButton).toBeInViewport();

    async function openPopup(rangeKey: string) {
      await select.selectOption(rangeKey);
      const popupEvent = page.waitForEvent('popup');
      await printButton.click();
      const popup = await popupEvent;
      await expect(popup.locator('section.week')).toHaveCount(rangeKey === 'month' ? 5 : 1);
      await expect.poll(() => popup.evaluate(() => document.documentElement.dataset.printCalled)).toBe('true');
      expect(await popup.evaluate(() => window.opener)).toBeNull();
      expect(await popup.locator('style').textContent()).toContain('size: A4 landscape');
      await expect(printButton).toBeInViewport();
      expect(await trigger.boundingBox()).toEqual(triggerBefore);
      return popup;
    }

    const month = await openPopup('month');
    await expect(month.locator('section.week').first().locator('.week-title')).toContainText('31 авг – 6 сен');
    await expect(month.locator('section.week').last().locator('.week-title')).toContainText('28 сен – 4 окт');
    await expect(month.locator('section.week').first().locator('td.employee'))
      .toHaveText(['Алина E2E', 'Борис E2E']);
    await month.close();

    const ordinary = await openPopup('week:2026-09-07');
    await expect(ordinary.locator('th.day-head strong')).toHaveText(['7', '8', '9', '10', '11', '12', '13']);
    await expect(ordinary.locator('td.employee').first().locator('xpath=..').locator('.hours')).toHaveText('7');
    await ordinary.close();

    const previous = await openPopup('week:2026-08-31');
    await expect(previous.locator('th.day-head strong')).toHaveText(['31', '1', '2', '3', '4', '5', '6']);
    await expect(previous.locator('th.day-head small')).toHaveText(['авг', 'сен', 'сен', 'сен', 'сен', 'сен', 'сен']);
    const firstRow = previous.locator('td.employee').first().locator('xpath=..');
    await expect(firstRow.locator('.shift-time')).toHaveText(['20:00-08:00', '08:00-17:00']);
    await expect(firstRow.locator('.off')).toHaveText('OFF');
    await expect(firstRow.locator('.error')).toHaveText('⚠');
    await expect(firstRow.locator('td.shift-cell').nth(4)).toBeEmpty();
    await expect(firstRow.locator('.hours')).toHaveText('20');
    await previous.close();

    const next = await openPopup('week:2026-09-28');
    await expect(next.locator('th.day-head strong')).toHaveText(['28', '29', '30', '1', '2', '3', '4']);
    await expect(next.locator('th.day-head small')).toHaveText(['сен', 'сен', 'сен', 'окт', 'окт', 'окт', 'окт']);
    const nextRow = next.locator('td.employee').first().locator('xpath=..');
    await expect(nextRow.locator('.shift-time')).toHaveText(['08:00-17:00', '10:00-18:00']);
    await expect(nextRow.locator('.hours')).toHaveText('15');
    await expect(nextRow.locator('.off')).toHaveText('OFF');
    await next.close();

    await page.getByTitle('Закрыть', { exact: true }).click();
    expect(await trigger.boundingBox()).toEqual(triggerBefore);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`blocked print popup shows app feedback without shifting layout at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { window.open = () => null; });
    await seed(page, state());
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Управление графиком' });
    const before = await trigger.boundingBox();
    await trigger.click();
    await page.getByRole('button', { name: 'Печать' }).click();
    const dialog = page.getByRole('dialog', { name: 'Печать' });
    await expect(dialog).toContainText('Браузер заблокировал окно печати');
    expect(await trigger.boundingBox()).toEqual(before);
    await dialog.getByRole('button', { name: 'Понятно' }).click();
    await expect(dialog).toHaveCount(0);
  });
}


for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`managed schedule rules drawer is usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));

    const timestamp = '2026-09-10T10:00:00.000Z';
    const reply = (route: Route, body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:4174',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        },
        body: JSON.stringify(body),
      });

    await page.route('**/departments/manageable', (route) =>
      reply(route, [
        {
          id: 'department-1',
          name: 'Front Office',
          kind: 'FO',
          position: 0,
          updatedAt: timestamp,
        },
      ]),
    );
    await page.route('**/wishes/department?**', (route) => reply(route, []));
    await page.route('**/schedule-data/department?**', (route) =>
      reply(route, {
        period: { year: 2026, month: 9 },
        schedule: { id: 'schedule-1', updatedAt: timestamp },
        department: {
          id: 'department-1',
          name: 'Front Office',
          kind: 'FO',
        },
        employees: [],
        shifts: [],
      }),
    );
    await page.route('**/schedule-rules/manageable', (route) =>
      reply(route, [
        {
          id: 'rule-1',
          name: 'Не более 5 одновременно',
          description: 'Ограничение Front Office',
          kind: 'MAX_CONCURRENT_EMPLOYEES',
          scope: 'DEPARTMENT',
          scopeValue: null,
          departmentId: 'department-1',
          priority: 100,
          severity: 'HARD',
          isActive: true,
          isDeleted: false,
          config: { maxConcurrent: 5 },
          violationMessage: 'В отделе одновременно больше 5 сотрудников.',
          version: 1,
          createdByUserId: 'e2e-admin-user',
          updatedByUserId: 'e2e-admin-user',
          createdAt: timestamp,
          updatedAt: timestamp,
          editable: true,
        },
      ]),
    );
    await page.route('**/schedule-rules/rule-1/history', (route) =>
      reply(route, [
        {
          id: 'rule-version-1',
          version: 1,
          snapshot: {
            name: 'Не более 5 одновременно',
            isActive: true,
          },
          changedByUserId: 'e2e-admin-user',
          createdAt: timestamp,
        },
      ]),
    );

    await page.goto('http://127.0.0.1:4174/planner');

    const toolsTrigger = page.getByRole('button', { name: 'Управление графиком' });
    const triggerBefore = await toolsTrigger.boundingBox();
    await toolsTrigger.click();
    await page.getByRole('button', { name: 'Управление правилами' }).click();

    const rulesDrawer = page.locator('aside').filter({
      has: page.getByText('Правила графика', { exact: true }),
    });
    await expect(rulesDrawer).toBeVisible();
    await expect(rulesDrawer.getByText('Не более 5 одновременно')).toBeVisible();
    await expect(rulesDrawer.getByText('Жёсткое', { exact: true })).toBeVisible();
    await expect(
      rulesDrawer.getByText('Активно', { exact: true }).first(),
    ).toBeVisible();

    await rulesDrawer.getByRole('button', { name: 'История' }).click();
    await expect(rulesDrawer.getByText(/^v1 ·/)).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await rulesDrawer.getByTitle('Закрыть').click();
    expect(await toolsTrigger.boundingBox()).toEqual(triggerBefore);
  });
}
