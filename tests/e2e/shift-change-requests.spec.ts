import { expect, test, type Page, type Route } from '@playwright/test';

const date = '2026-09-28';
const source = { id: 'shift-a', employeeId: 'employee-a', date, startTime: '08:00', endTime: '17:00', code: null, isOff: false, updatedAt: '2026-09-01T00:00:00.000Z' };
const off = { ...source, id: 'shift-off', date: '2026-09-29', isOff: true, startTime: null, endTime: null };
const targetShift = { id: 'shift-b', date: '2026-09-30', startTime: '09:00', endTime: '18:00', code: null };

type Actor = 'requester' | 'target' | 'manager';

function reply(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': route.request().headers().origin || 'http://127.0.0.1:4173', 'Access-Control-Allow-Credentials': 'true' },
    body: JSON.stringify(data),
  });
}

function request(kind: 'COVER' | 'SWAP', status: string) {
  return {
    id: 'request-1', kind, status, requesterEmployeeId: 'employee-a', targetEmployeeId: 'employee-b',
    requesterEmployee: { displayName: 'Сотрудник А' }, targetEmployee: { displayName: 'Сотрудник Б' },
    requesterShift: source, targetShift: kind === 'SWAP' ? targetShift : null,
    createdAt: '2026-09-20T00:00:00.000Z',
  };
}

async function mockWorkflow(page: Page) {
  let actor: Actor = 'requester';
  let kind: 'COVER' | 'SWAP' = 'COVER';
  let status = '';
  let draftOwner = 'employee-a';
  let publishedVersion = 1;
  let conflict = false;

  await page.route('**/auth/me', route => reply(route, {
    id: 'user-' + actor, phoneE164: '+79990000000',
    employee: { id: actor === 'target' ? 'employee-b' : 'employee-a', displayName: actor, departmentId: 'department-1', departmentName: 'Отдел', employmentRate: 1, scheduleMode: 'FLEXIBLE', fixedStartTime: null, fixedEndTime: null },
    memberships: actor === 'manager' ? [{ id: 'membership-1', role: 'DEPARTMENT_ADMIN', departmentId: 'department-1' }] : [],
  }));
  await page.route('**/schedule-data/me?**', route => reply(route, {
    period: { year: 2026, month: 9 }, schedule: { id: 'schedule-1', updatedAt: '2026-09-01T00:00:00.000Z' },
    employee: { id: actor === 'target' ? 'employee-b' : 'employee-a', displayName: actor, employmentRate: 1, scheduleMode: 'FLEXIBLE', fixedStartTime: null, fixedEndTime: null, department: { id: 'department-1', name: 'Отдел', kind: 'GENERAL' } },
    shifts: actor !== 'target' && publishedVersion === 1 ? [source, off] : actor === 'target' && publishedVersion > 1 ? [{ ...source, employeeId: 'employee-b' }] : [],
  }));
  await page.route('**/shift-change-requests/**', route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/discovery/targets')) return reply(route, [{ id: 'employee-b', displayName: 'Сотрудник Б' }]);
    if (path.includes('/discovery/targets/employee-b/shift')) {
      expect(url.searchParams.get('sourceShiftId')).toBe('shift-a');
      return reply(route, targetShift);
    }
    if (path.endsWith('/mine')) return reply(route, status ? [request(kind, status)] : []);
    if (path.endsWith('/incoming')) return reply(route, actor === 'target' && status ? [request(kind, status)] : []);
    if (path.endsWith('/admin/pending')) return reply(route, actor === 'manager' && status === 'PENDING_MANAGER' ? [request(kind, status)] : []);
    if (route.request().method() === 'POST') {
      if (conflict) { status = 'STALE'; return reply(route, { message: 'Request is stale' }, 409); }
      if (path.endsWith('/accept')) status = 'PENDING_MANAGER';
      if (path.endsWith('/reject')) status = 'TARGET_REJECTED';
      if (path.endsWith('/cancel')) status = 'CANCELED';
      if (path.endsWith('/admin/approve')) { status = 'MANAGER_APPROVED'; draftOwner = 'employee-b'; }
      if (path.endsWith('/admin/reject')) status = 'MANAGER_REJECTED';
      return reply(route, request(kind, status), 201);
    }
    return reply(route, {}, 404);
  });
  await page.route('**/shift-change-requests', route => {
    const body = route.request().postDataJSON() as { kind: 'COVER' | 'SWAP'; requesterShiftId: string; targetShiftId?: string };
    expect(body.requesterShiftId).toBe('shift-a');
    if (body.kind === 'SWAP') expect(body.targetShiftId).toBe('shift-b');
    kind = body.kind;
    status = 'PENDING_TARGET';
    return reply(route, request(kind, status), 201);
  });
  return {
    become: async (next: Actor) => { actor = next; await page.reload(); },
    getDraftOwner: () => draftOwner,
    publish: () => { publishedVersion++; },
    setConflict: () => { conflict = true; },
  };
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`employee → target → manager workflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-20T12:00:00Z'));
    const workflow = await mockWorkflow(page);
    await page.goto('/my-schedule');
    await expect(page.getByText('OFF')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Обмен / подмена' })).toHaveCount(1);
    const trigger = page.getByRole('button', { name: 'Обмен / подмена' });
    const before = await trigger.boundingBox();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Обмен / подмена' });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 2);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 2);
    await dialog.getByLabel('Сотрудник', { exact: true }).selectOption('employee-b');
    await dialog.getByRole('button', { name: 'Отправить запрос' }).click();
    expect(Math.abs((await trigger.boundingBox())!.x - before!.x)).toBeLessThanOrEqual(3);
    await page.getByRole('link', { name: 'Обмен сменами' }).click();
    await expect(page.getByText('Ожидает ответа сотрудника')).toBeVisible();
    await workflow.become('target');
    await expect(page.getByRole('button', { name: 'Согласиться' })).toBeVisible();
    await page.getByRole('button', { name: 'Согласиться' }).click();
    await expect(page.getByRole('region', { name: 'Входящие' }).getByText('Ожидает решения руководителя')).toBeVisible();
    await workflow.become('manager');
    await expect(page.getByRole('button', { name: 'Одобрить' })).toBeVisible();
    await page.getByRole('button', { name: 'Одобрить' }).click();
    expect(workflow.getDraftOwner()).toBe('employee-b');
    await expect(page.getByText(/Чтобы оно стало официальным/)).toBeVisible();
    await workflow.become('requester');
    await page.goto('/my-schedule');
    await expect(page.getByText('08:00–17:00')).toBeVisible();
    workflow.publish();
    await page.reload();
    await expect(page.getByText('08:00–17:00')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('SWAP preview and cancel, reject, stale conflict stay truthful', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-20T12:00:00Z'));
  const workflow = await mockWorkflow(page);
  await page.goto('/my-schedule');
  await page.getByRole('button', { name: 'Обмен / подмена' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Тип запроса').selectOption('SWAP');
  await dialog.getByLabel('Сотрудник', { exact: true }).selectOption('employee-b');
  await dialog.getByLabel('Дата смены сотрудника').fill('2026-09-30');
  await expect(dialog.getByText('Вы получаете: 2026-09-30 · 09:00–18:00')).toBeVisible();
  await dialog.getByRole('button', { name: 'Отправить запрос' }).click();
  await page.goto('/shift-requests');
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByText('Отменено')).toBeVisible();
  // A fresh request, then target rejection.
  await page.getByLabel('Тип запроса').selectOption('SWAP');
  await page.getByLabel('Сотрудник', { exact: true }).selectOption('employee-b');
  await page.getByLabel('Дата смены сотрудника').fill('2026-09-30');
  await page.getByRole('button', { name: 'Отправить запрос' }).click();
  await workflow.become('target');
  await page.getByRole('button', { name: 'Отказаться' }).click();
  await expect(page.getByRole('region', { name: 'Входящие' }).getByText('Сотрудник отказался')).toBeVisible();
  // Another accepted request encounters a stale source at management approval.
  await workflow.become('requester');
  await page.getByLabel('Тип запроса').selectOption('SWAP');
  await page.getByLabel('Сотрудник', { exact: true }).selectOption('employee-b');
  await page.getByLabel('Дата смены сотрудника').fill('2026-09-30');
  await page.getByRole('button', { name: 'Отправить запрос' }).click();
  await workflow.become('target');
  await page.getByRole('button', { name: 'Согласиться' }).click();
  await workflow.become('manager');
  workflow.setConflict();
  await page.getByRole('button', { name: 'Одобрить' }).click();
  await expect(page.getByRole('alert')).toContainText('Смена уже изменилась');
  await expect(page.getByText('Одобрено руководителем')).toHaveCount(0);
});
