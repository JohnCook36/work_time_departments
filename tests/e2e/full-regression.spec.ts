import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';

const STORAGE_KEY = 'hotel-shift-planner';

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

function employeeRow(page: Page, name = 'E2E Сотрудник') {
  return page.getByText(name, { exact: true }).locator('xpath=ancestor::tr');
}

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
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
