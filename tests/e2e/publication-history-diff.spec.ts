import { expect, test, type Page, type Route } from '@playwright/test';

const department = {
  id: 'department-history',
  name: 'Front Office',
  kind: 'FO',
  position: 0,
  updatedAt: '2026-09-25T08:00:00.000Z',
};

function publication(version: number) {
  const employeeBefore = {
    id: 'employee-1',
    displayName: 'Иванов И.И.',
    employmentRate: 1,
    scheduleMode: 'FLEXIBLE',
    fixedStartTime: null,
    fixedEndTime: null,
  };
  const employeeAfter = {
    ...employeeBefore,
    employmentRate: 0.75,
  };
  const otherEmployees = [
    { ...employeeBefore, id: 'employee-2', displayName: 'Петров П.П.' },
    { ...employeeBefore, id: 'employee-3', displayName: 'Сидорова С.С.' },
  ];
  const shiftBefore = {
    id: 'shift-1',
    employeeId: 'employee-1',
    date: '2026-09-07',
    code: null,
    startTime: '08:00',
    endTime: '17:00',
    isOff: false,
    updatedAt: '2026-09-24T08:00:00.000Z',
  };
  const shiftAfter = {
    ...shiftBefore,
    id: 'shift-2',
    startTime: '09:00',
    endTime: '18:00',
    updatedAt: '2026-09-25T08:00:00.000Z',
  };
  const addedShift = {
    id: 'shift-3',
    employeeId: 'employee-1',
    date: '2026-09-08',
    code: null,
    startTime: '10:00',
    endTime: '19:00',
    isOff: false,
    updatedAt: '2026-09-25T08:00:00.000Z',
  };

  return {
    id: 'publication-' + version,
    scheduleId: 'schedule-1',
    departmentId: department.id,
    version,
    publishedByLabel: 'Администратор FO',
    sourceScheduleUpdatedAt: '2026-09-25T08:00:00.000Z',
    comment: version === 2 ? 'Обновлены смены' : 'Первая версия',
    rulesVersion: 'rules-v1',
    rulesSnapshot: null,
    snapshot: {
      department: {
        id: department.id,
        name: department.name,
        kind: department.kind,
      },
      employees: version === 2
        ? [employeeAfter, ...otherEmployees]
        : [employeeBefore],
      shifts: version === 2 ? [shiftAfter, addedShift] : [shiftBefore],
    },
    diff: {
      employees:
        version === 2
          ? [
              { key: 'employee-1', before: employeeBefore, after: employeeAfter },
              ...otherEmployees.map(employee => ({
                key: employee.id,
                before: null,
                after: employee,
              })),
            ]
          : [{ key: 'employee-1', before: null, after: employeeBefore }],
      shifts:
        version === 2
          ? [
              {
                key: 'employee-1:2026-09-07',
                before: shiftBefore,
                after: shiftAfter,
              },
              {
                key: 'employee-1:2026-09-08',
                before: null,
                after: addedShift,
              },
            ]
          : [
              {
                key: 'employee-1:2026-09-07',
                before: null,
                after: shiftBefore,
              },
            ],
    },
    createdAt:
      version === 2
        ? '2026-09-25T08:00:00.000Z'
        : '2026-09-24T08:00:00.000Z',
  };
}

function cors(route: Route) {
  return {
    'Access-Control-Allow-Origin':
      route.request().headers().origin || 'http://127.0.0.1:4174',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  };
}

async function reply(route: Route, body: unknown, status = 200) {
  if (status === 204) {
    await route.fulfill({ status, headers: cors(route) });
    return;
  }
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: cors(route),
    body: JSON.stringify(body),
  });
}

async function mockServer(page: Page) {
  let absenceItems = [
    {
      id: 'absence-1',
      employeeId: 'employee-1',
      type: 'VACATION',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      comment: 'Плановый отпуск',
      status: 'ACTIVE',
      canceledAt: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-01T08:00:00.000Z',
    },
  ];

  await page.route('http://localhost:3000/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (method === 'OPTIONS') return reply(route, {}, 204);

    if (path === '/auth/me') {
      return reply(route, {
        id: 'admin-user',
        phoneE164: '+79990000000',
        employee: {
          id: 'admin-employee',
          displayName: 'Администратор FO',
          departmentId: department.id,
          departmentName: department.name,
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
        },
        memberships: [
          {
            id: 'membership-admin',
            role: 'DEPARTMENT_ADMIN',
            departmentId: department.id,
          },
        ],
      });
    }

    if (path === '/departments/manageable') {
      return reply(route, [department]);
    }

    if (path === '/wishes/department') return reply(route, []);
    if (path === '/onboarding/admin/departments') return reply(route, [department]);
    if (path === '/onboarding/admin/pending') return reply(route, []);

    if (path === '/schedule-data/department') {
      return reply(route, {
        period: { year: 2026, month: 9 },
        schedule: {
          id: 'schedule-1',
          updatedAt: '2026-09-25T08:00:00.000Z',
        },
        department: {
          id: department.id,
          name: department.name,
          kind: department.kind,
        },
        employees: [
          {
            id: 'employee-1',
            displayName: 'Иванов И.И.',
            employmentRate: 0.75,
            scheduleMode: 'FLEXIBLE',
            fixedStartTime: null,
            fixedEndTime: null,
            position: 0,
            updatedAt: '2026-09-25T08:00:00.000Z',
          },
        ],
        shifts: publication(2).snapshot.shifts,
      });
    }

    if (path === '/schedule-data/department/publications') {
      return reply(route, [publication(2), publication(1)]);
    }

    if (path === '/schedule-data/department/publication') {
      const version = Number(url.searchParams.get('version'));
      return reply(route, publication(version));
    }

    if (path === '/schedule-data/department/publication-acknowledgements') {
      const publicationId = url.searchParams.get('publicationId');
      if (publicationId !== 'publication-1' && publicationId !== 'publication-2') {
        return reply(route, { message: 'Unexpected publication' }, 404);
      }
      return reply(route, {
        publicationId,
        departmentId: department.id,
        version: Number(publicationId.slice(-1)),
        employees: publicationId === 'publication-2'
          ? [
              { employeeId: 'employee-1', displayName: 'Иванов И.И.', status: 'ACKNOWLEDGED', acknowledgedAt: '2026-09-25T10:30:00.000Z' },
              { employeeId: 'employee-2', displayName: 'Петров П.П.', status: 'NOT_ACKNOWLEDGED', acknowledgedAt: null },
              { employeeId: 'employee-3', displayName: 'Сидорова С.С.', status: 'NO_ACTIVE_ACCOUNT', acknowledgedAt: null },
            ]
          : [
              { employeeId: 'employee-1', displayName: 'Иванов И.И.', status: 'NOT_ACKNOWLEDGED', acknowledgedAt: null },
            ],
      });
    }
    if (path === '/absences' && method === 'GET') {
      return reply(route, absenceItems);
    }

    if (path === '/absences' && method === 'POST') {
      const payload = route.request().postDataJSON() as {
        employeeId: string;
        type: string;
        startDate: string;
        endDate: string;
        comment?: string | null;
      };
      const created = {
        id: 'absence-' + (absenceItems.length + 1),
        employeeId: payload.employeeId,
        type: payload.type,
        startDate: payload.startDate,
        endDate: payload.endDate,
        comment: payload.comment ?? null,
        status: 'ACTIVE',
        canceledAt: null,
        createdAt: '2026-09-25T12:00:00.000Z',
        updatedAt: '2026-09-25T12:00:00.000Z',
      };
      absenceItems = [...absenceItems, created];
      return reply(route, created, 201);
    }

    const absenceMatch = path.match(/^\/absences\/([^/]+)$/);
    if (absenceMatch && method === 'PATCH') {
      const payload = route.request().postDataJSON() as {
        type?: string;
        startDate?: string;
        endDate?: string;
        comment?: string | null;
      };
      const id = absenceMatch[1];
      const current = absenceItems.find(item => item.id === id);
      if (!current) return reply(route, { message: 'Not found' }, 404);
      const updated = {
        ...current,
        ...payload,
        updatedAt: '2026-09-25T12:15:00.000Z',
      };
      absenceItems = absenceItems.map(item => item.id === id ? updated : item);
      return reply(route, updated);
    }

    const cancelMatch = path.match(/^\/absences\/([^/]+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
      const id = cancelMatch[1];
      absenceItems = absenceItems.map(item =>
        item.id === id
          ? {
              ...item,
              status: 'CANCELED',
              canceledAt: '2026-09-25T12:20:00.000Z',
              updatedAt: '2026-09-25T12:20:00.000Z',
            }
          : item,
      );
      return reply(route, { status: 'ok', absenceId: id }, 201);
    }


    return reply(route, { message: 'Unhandled E2E route: ' + path }, 404);
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`publication history shows immutable before/after diff at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
    await mockServer(page);

    await page.goto('http://127.0.0.1:4174/planner');
    await expect(page.getByText('Иванов И.И.', { exact: true })).toBeVisible();

    const trigger = page.getByRole('button', { name: 'Управление графиком' });
    const before = await trigger.boundingBox();
    await trigger.click();
    const after = await trigger.boundingBox();

    if (before && after) {
      expect(Math.abs(before.x - after.x)).toBeLessThanOrEqual(3);
      expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(3);
    }

    const absences = page.getByRole('region', {
      name: 'Структурированные отсутствия',
    });
    await expect(absences.getByText('Плановый отпуск')).toBeVisible();
    await expect(absences.getByText('Отпуск', { exact: true })).toBeVisible();

    const absenceType = absences.getByLabel('Тип');
    await absenceType.selectOption('SICK');
    await expect(absences.getByLabel('Рабочая заметка')).toBeDisabled();
    await absences.getByLabel('С').fill('2026-09-20');
    await absences.getByLabel('По').fill('2026-09-21');
    await absences.getByRole('button', { name: 'Добавить отсутствие' }).click();
    await expect(absences.getByText('Отсутствие добавлено.')).toBeVisible();
    await expect(absences.getByText('Больничный', { exact: true })).toBeVisible();

    await absences.getByRole('button', { name: 'Редактировать' }).first().click();
    await absences.getByLabel('По').fill('2026-09-13');
    await absences.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(absences.getByText('Отсутствие обновлено.')).toBeVisible();
    await expect(absences.getByText(/2026-09-10 — 2026-09-13/)).toBeVisible();

    await absences.getByRole('button', { name: 'Отменить отсутствие' }).first().click();
    await expect(absences.getByText('Отсутствие отменено.')).toBeVisible();
    await expect(absences.getByText('Отменено', { exact: true })).toBeVisible();

    await expect(page.getByText(/^v2 ·/)).toBeVisible();
    await page.getByRole('button', { name: 'Открыть v2' }).click();

    const acknowledgements = page.getByRole('region', { name: 'Ознакомление сотрудников' });
    await expect(acknowledgements.getByText('Ознакомлен', { exact: true })).toBeVisible();
    await expect(acknowledgements.getByText('Не ознакомлен', { exact: true })).toBeVisible();
    await expect(acknowledgements.getByText('Нет активного аккаунта')).toBeVisible();
    await expect(acknowledgements.getByText('25.09.2026, 10:30')).toBeVisible();
    await expect(acknowledgements.getByText('Петров П.П.')).toBeVisible();
    await expect(acknowledgements.getByText('Сидорова С.С.')).toBeVisible();
    await expect(acknowledgements).not.toContainText('user-');
    await expect(acknowledgements).not.toContainText('+7999');

    await page.getByRole('button', { name: 'Открыть v1' }).click();
    await expect(acknowledgements.getByText('Не ознакомлен', { exact: true })).toBeVisible();
    await expect(acknowledgements.getByText('Ознакомлен', { exact: true })).toHaveCount(0);
    await expect(acknowledgements.getByText('Петров П.П.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Открыть v2' }).click();
    await expect(acknowledgements.getByText('Ознакомлен', { exact: true })).toBeVisible();

    await expect(page.getByText('Изменения смен')).toBeVisible();
    await expect(
      page.getByText('Иванов И.И. · 2026-09-07'),
    ).toBeVisible();
    await expect(page.getByText('Было: 08:00–17:00')).toBeVisible();
    await expect(page.getByText('Стало: 09:00–18:00')).toBeVisible();

    await expect(
      page.getByText('Иванов И.И. · 2026-09-08'),
    ).toBeVisible();
    await expect(page.getByText('Было: нет смены')).toBeVisible();
    await expect(page.getByText('Стало: 10:00–19:00')).toBeVisible();

    await expect(page.getByText('Изменения сотрудников')).toBeVisible();
    await expect(
      page.getByText('Было: Иванов И.И. · ставка 1 · FLEXIBLE'),
    ).toBeVisible();
    await expect(
      page.getByText('Стало: Иванов И.И. · ставка 0.75 · FLEXIBLE'),
    ).toBeVisible();

    await expect(page.getByText('Снимок версии')).toBeVisible();
    await expect(
      page.getByText(/2026-09-07 · Иванов И\.И\. · 09:00–18:00/),
    ).toBeVisible();
    await expect(page.getByText(/employee-1 · 2026-09-07/)).toHaveCount(0);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
