import { expect, test, type Page, type Route } from '@playwright/test';

type RequestKind = 'CREATE_EMPLOYEE' | 'LINK_EXISTING';
type Actor = 'requester' | 'manager';

const department = { id: 'department-fo', name: 'Front Office', kind: 'FO' };
const requesterPhone = '+79991112233';
const managerPhone = '+79994445566';
const existingEmployee = {
  id: 'employee-existing',
  displayName: 'Существующий сотрудник',
  departmentId: department.id,
};
const existingShift = {
  id: 'shift-existing',
  employeeId: existingEmployee.id,
  date: '2026-09-28',
  code: null,
  startTime: '08:00',
  endTime: '17:00',
  isOff: false,
  updatedAt: '2026-09-20T08:00:00.000Z',
};

function cors(route: Route) {
  return {
    'Access-Control-Allow-Origin':
      route.request().headers().origin || 'http://127.0.0.1:4173',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}

function reply(route: Route, body: unknown, status = 200) {
  if (status === 204) {
    return route.fulfill({ status, headers: cors(route) });
  }
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: cors(route),
    body: JSON.stringify(body),
  });
}

async function mockOnboarding(page: Page, kind: RequestKind) {
  let actor: Actor = 'requester';
  let status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED' =
    'NONE';
  const requestedName = 'Новый сотрудник E2E';

  const request = () => ({
    id: 'request-1',
    type: kind,
    status: status === 'NONE' ? 'PENDING' : status,
    departmentId: department.id,
    employeeId: kind === 'LINK_EXISTING' ? existingEmployee.id : null,
    requestedDisplayName: kind === 'CREATE_EMPLOYEE' ? requestedName : null,
    reviewedAt:
      status === 'APPROVED' || status === 'REJECTED'
        ? '2026-09-25T10:00:00.000Z'
        : null,
    createdAt: '2026-09-25T09:00:00.000Z',
    updatedAt: '2026-09-25T09:00:00.000Z',
  });

  await page.route('http://localhost:3000/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (method === 'OPTIONS') return reply(route, {}, 204);

    if (path === '/auth/me') {
      if (actor === 'manager') {
        return reply(route, {
          id: 'user-manager',
          phoneE164: managerPhone,
          employee: {
            id: 'employee-manager',
            displayName: 'Руководитель E2E',
            departmentId: department.id,
            departmentName: department.name,
            employmentRate: 1,
            scheduleMode: 'FLEXIBLE',
            fixedStartTime: null,
            fixedEndTime: null,
          },
          memberships: [
            {
              id: 'membership-manager',
              role: 'DEPARTMENT_ADMIN',
              departmentId: department.id,
            },
          ],
        });
      }

      const linked = status === 'APPROVED';
      const employeeId =
        kind === 'LINK_EXISTING' ? existingEmployee.id : 'employee-created';
      const displayName =
        kind === 'LINK_EXISTING' ? existingEmployee.displayName : requestedName;
      return reply(route, {
        id: 'user-requester',
        phoneE164: requesterPhone,
        employee: linked
          ? {
              id: employeeId,
              displayName,
              departmentId: department.id,
              departmentName: department.name,
              employmentRate: 1,
              scheduleMode: 'FLEXIBLE',
              fixedStartTime: null,
              fixedEndTime: null,
            }
          : null,
        memberships: linked
          ? [
              {
                id: 'membership-requester',
                role: 'EMPLOYEE',
                departmentId: department.id,
              },
            ]
          : [],
      });
    }

    if (path === '/auth/logout' && method === 'POST') {
      return reply(route, { status: 'ok' });
    }

    if (path === '/onboarding/status') {
      return reply(route, status === 'PENDING' ? request() : null);
    }

    if (path === '/onboarding/departments') {
      return reply(route, [department]);
    }

    if (path === '/onboarding/candidates') {
      return reply(route, kind === 'LINK_EXISTING' ? [existingEmployee] : []);
    }

    if (path === '/onboarding/link-request' && method === 'POST') {
      status = 'PENDING';
      return reply(route, request(), 201);
    }

    if (path === '/onboarding/registration-request' && method === 'POST') {
      status = 'PENDING';
      return reply(route, request(), 201);
    }

    if (path === '/onboarding/cancel' && method === 'POST') {
      status = 'CANCELED';
      return reply(route, request(), 201);
    }

    if (path === '/onboarding/admin/departments') {
      return reply(route, [department]);
    }

    if (path === '/onboarding/admin/pending') {
      return reply(
        route,
        status === 'PENDING'
          ? [
              {
                ...request(),
                employee:
                  kind === 'LINK_EXISTING'
                    ? {
                        id: existingEmployee.id,
                        displayName: existingEmployee.displayName,
                      }
                    : null,
              },
            ]
          : [],
      );
    }

    if (path === '/onboarding/admin/request-1/approve' && method === 'POST') {
      status = 'APPROVED';
      return reply(
        route,
        {
          request: request(),
          employee: {
            id:
              kind === 'LINK_EXISTING'
                ? existingEmployee.id
                : 'employee-created',
            displayName:
              kind === 'LINK_EXISTING'
                ? existingEmployee.displayName
                : requestedName,
            departmentId: department.id,
          },
        },
        201,
      );
    }

    if (path === '/onboarding/admin/request-1/reject' && method === 'POST') {
      status = 'REJECTED';
      return reply(route, request(), 201);
    }

    if (path === '/schedule-data/me') {
      const employee =
        kind === 'LINK_EXISTING'
          ? existingEmployee
          : {
              id: 'employee-created',
              displayName: requestedName,
              departmentId: department.id,
            };
      return reply(route, {
        period: {
          year: Number(url.searchParams.get('year')),
          month: Number(url.searchParams.get('month')),
        },
        schedule: {
          id: 'schedule-1',
          updatedAt: '2026-09-20T08:00:00.000Z',
        },
        employee: {
          id: employee.id,
          displayName: employee.displayName,
          employmentRate: 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
          department,
        },
        shifts: kind === 'LINK_EXISTING' ? [existingShift] : [],
      });
    }

    return reply(route, { message: 'Unhandled E2E route: ' + path }, 404);
  });

  return {
    become(next: Actor) {
      actor = next;
    },
    getStatus() {
      return status;
    },
  };
}

async function submitRequester(page: Page, kind: RequestKind) {
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Найдите свой профиль' })).toBeVisible();

  if (kind === 'CREATE_EMPLOYEE') {
    await page.getByPlaceholder('Имя и фамилия').fill('Новый сотрудник E2E');
    await page
      .getByRole('button', { name: 'Запросить создание профиля' })
      .click();
  } else {
    await page.getByPlaceholder('Начните вводить имя').fill('Существующий');
    await page.getByRole('button', { name: 'Найти' }).click();
    await page
      .getByRole('button', { name: /Существующий сотрудник/ })
      .click();
  }

  await expect(
    page.getByText('Запрос ожидает подтверждения администратора'),
  ).toBeVisible();
}

async function approveAsManager(page: Page) {
  await page.goto('/planner');
  const trigger = page.getByTitle(/Заявки на привязку аккаунтов/);
  await expect(trigger).toBeVisible();
  const before = await trigger.boundingBox();

  const notificationAction = page.getByRole('button', {
    name: 'Открыть заявки',
  });
  if (await notificationAction.isVisible().catch(() => false)) {
    await notificationAction.click();
  } else {
    await trigger.click();
  }

  await expect(page.getByText('Привязка аккаунтов', { exact: true })).toBeVisible();
  await expect(page.getByText(requesterPhone)).toHaveCount(0);
  const drawer = page.locator('aside').filter({ hasText: 'Привязка аккаунтов' });
  await expect(drawer.getByRole('button', { name: 'Подтвердить' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(drawer.getByText(/новых заявок нет/)).toBeVisible();

  const stableTrigger = page.getByTitle(/Заявки на привязку аккаунтов/);
  const after = await stableTrigger.boundingBox();
  if (before && after) {
    expect(Math.abs(before.x - after.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(3);
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  for (const kind of ['CREATE_EMPLOYEE', 'LINK_EXISTING'] as const) {
    test(`${kind} request → manager approval → linked profile at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
      const flow = await mockOnboarding(page, kind);

      await submitRequester(page, kind);
      expect(flow.getStatus()).toBe('PENDING');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      flow.become('manager');
      await approveAsManager(page);
      expect(flow.getStatus()).toBe('APPROVED');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      flow.become('requester');
      await page.goto('/onboarding');
      await expect(page).toHaveURL(/\/my-schedule$/);
      await expect(page.getByRole('heading', { name: 'Мои смены' })).toBeVisible();

      if (kind === 'LINK_EXISTING') {
        await expect(page.getByText('08:00–17:00')).toBeVisible();
      } else {
        await expect(page.getByText('08:00–17:00')).toHaveCount(0);
      }

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }
}

test('cancel and manager rejection return the requester to a usable onboarding form', async ({
  page,
}) => {
  const flow = await mockOnboarding(page, 'CREATE_EMPLOYEE');

  await submitRequester(page, 'CREATE_EMPLOYEE');
  await page.getByRole('button', { name: 'Отменить запрос' }).click();
  await expect(
    page.getByRole('heading', { name: 'Найдите свой профиль' }),
  ).toBeVisible();
  expect(flow.getStatus()).toBe('CANCELED');

  await page.getByPlaceholder('Имя и фамилия').fill('Новый сотрудник E2E');
  await page
    .getByRole('button', { name: 'Запросить создание профиля' })
    .click();
  expect(flow.getStatus()).toBe('PENDING');

  flow.become('manager');
  await page.goto('/planner');
  await page.getByTitle(/Заявки на привязку аккаунтов: 1/).click();
  const drawer = page.locator('aside').filter({ hasText: 'Привязка аккаунтов' });
  await drawer.getByRole('button', { name: 'Отклонить' }).click();
  expect(flow.getStatus()).toBe('REJECTED');

  flow.become('requester');
  await page.goto('/onboarding');
  await expect(
    page.getByRole('heading', { name: 'Найдите свой профиль' }),
  ).toBeVisible();
});
