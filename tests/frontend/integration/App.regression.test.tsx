import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../../src/screens/planner/PlannerScreen';
import * as excelImport from '../../../src/services/excel/importExcel';
import * as plannerApi from '../../../src/api/planner';
import * as printScheduleModule from '../../../src/services/print/printSchedule';
import { AuthUserContext } from '../../../src/auth/AuthContext';
import type { AuthUser } from '../../../src/api/auth';
import { AppThemeProvider } from '../../../src/theme/AppThemeProvider';

const STORAGE_KEY = 'hotel-shift-planner';

const managementUser: AuthUser = {
  id: 'test-admin-user',
  phoneE164: '+79990000000',
  employee: {
    id: 'test-admin-employee',
    displayName: 'Тестовый администратор',
    departmentId: 'department',
    employmentRate: 1,
    scheduleMode: 'FLEXIBLE',
    fixedStartTime: null,
    fixedEndTime: null,
  },
  memberships: [
    {
      id: 'test-admin-membership',
      role: 'SUPER_ADMIN',
      departmentId: null,
    },
  ],
};

function renderApp() {
  return render(
    <AppThemeProvider>
      <MemoryRouter>
        <AuthUserContext.Provider value={managementUser}>
          <App />
        </AuthUserContext.Provider>
      </MemoryRouter>
    </AppThemeProvider>,
  );
}

function currentPeriodKey(): string {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function serverPlannerSnapshot(): plannerApi.PlannerServerSnapshot {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  return {
    departments: [
      { id: 'server-department', name: 'Серверный отдел', kind: 'fo' },
    ],
    employees: [
      {
        id: 'server-employee',
        name: 'Серверный сотрудник',
        departmentId: 'server-department',
        employmentRate: 1,
        scheduleMode: 'flexible',
      },
    ],
    schedule: {
      'server-employee': {
        1: {
          type: 'shift',
          shift: { start: '08:00', end: '17:00' },
        },
      },
    },
    wishes: {
      'server-employee': {
        [currentPeriodKey()]: [],
      },
    },
    cellMetadata: {
      'server-employee': {
        1: {
          shiftId: 'server-shift',
          updatedAt: year + '-' + month + '-01T10:00:00.000Z',
        },
      },
    },
    employeeMetadata: {
      'server-employee': {
        updatedAt: year + '-' + month + '-01T09:00:00.000Z',
      },
    },
    departmentMetadata: {
      'server-department': {
        updatedAt: year + '-' + month + '-01T08:00:00.000Z',
      },
    },
  };
}

function seedCurrentSchedule(value = '15:00-23:00') {
  const [start, end] = value.split('-');
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      departments: [{ id: 'department', name: 'Тестовый отдел', kind: 'general' }],
      employees: [
        {
          id: 'employee',
          name: 'Тестовый сотрудник',
          departmentId: 'department',
          employmentRate: 1,
        },
      ],
      schedules: {
        [currentPeriodKey()]: {
          employee: {
            1: { type: 'shift', shift: { start, end } },
          },
        },
      },
      wishes: {},
      collapsedDepartments: [],
    }),
  );
}

describe('App regression flows', () => {
  beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('loads the backend snapshot and blocks mutations in server read mode', async () => {
    vi.stubEnv('VITE_SERVER_PLANNER_READ', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(
      serverPlannerSnapshot(),
    );

    renderApp();

    expect(await screen.findByText('Серверный сотрудник')).toBeInTheDocument();
    expect(screen.getByText(/контролируемый read-only этап/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новый сотрудник' })).toBeDisabled();
    expect(screen.getByText('08:00–17:00')).toBeInTheDocument();
  });

  it('ignores and does not overwrite planner localStorage in server read mode', async () => {
    const legacyRaw = JSON.stringify({
      departments: [
        { id: 'legacy-department', name: 'Старый локальный отдел', kind: 'general' },
      ],
      employees: [
        {
          id: 'legacy-employee',
          name: 'Старый локальный сотрудник',
          departmentId: 'legacy-department',
          employmentRate: 1,
        },
      ],
      schedules: {
        [currentPeriodKey()]: {
          'legacy-employee': {
            1: {
              type: 'shift',
              shift: { start: '10:00', end: '19:00' },
            },
          },
        },
      },
      wishes: {},
      collapsedDepartments: [],
    });
    localStorage.setItem(STORAGE_KEY, legacyRaw);

    vi.stubEnv('VITE_SERVER_PLANNER_READ', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(
      serverPlannerSnapshot(),
    );

    renderApp();

    expect(
      screen.queryByText('Старый локальный сотрудник'),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('Серверный сотрудник')).toBeInTheDocument();

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe(legacyRaw);
    });
  });

  it('preloads adjacent server periods before full-month print', async () => {
    const user = userEvent.setup();
    const current = serverPlannerSnapshot();
    const previous = serverPlannerSnapshot();
    const next = serverPlannerSnapshot();
    previous.schedule = {
      'server-employee': {
        1: {
          type: 'shift',
          shift: { start: '07:00', end: '16:00' },
        },
      },
    };
    next.schedule = {
      'server-employee': {
        1: {
          type: 'off',
        },
      },
    };

    const now = new Date();
    const previousMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );
    const nextMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    );

    vi.stubEnv('VITE_SERVER_PLANNER_READ', '1');
    const loadSpy = vi
      .spyOn(plannerApi, 'loadPlannerServerSnapshot')
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(previous)
      .mockResolvedValueOnce(next);
    const printSpy = vi
      .spyOn(printScheduleModule, 'printSchedule')
      .mockImplementation(() => undefined);

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(screen.getByRole('button', { name: 'Печать' }));

    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalledWith(
        previousMonth.getFullYear(),
        previousMonth.getMonth() + 1,
      );
      expect(loadSpy).toHaveBeenCalledWith(
        nextMonth.getFullYear(),
        nextMonth.getMonth() + 1,
      );
      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    const printOptions = printSpy.mock.calls[0][0];
    const previousKey =
      previousMonth.getFullYear() +
      '-' +
      String(previousMonth.getMonth() + 1).padStart(2, '0');
    const nextKey =
      nextMonth.getFullYear() +
      '-' +
      String(nextMonth.getMonth() + 1).padStart(2, '0');

    expect(
      printOptions.schedules[previousKey]['server-employee'][1],
    ).toEqual({
      type: 'shift',
      shift: { start: '07:00', end: '16:00' },
    });
    expect(
      printOptions.schedules[nextKey]['server-employee'][1],
    ).toEqual({ type: 'off' });
  });

  it('enables server-backed Department reorder only for Super Admin', async () => {
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(
      serverPlannerSnapshot(),
    );

    renderApp();

    await screen.findByText('Серверный сотрудник');
    expect(
      screen.getByRole('button', { name: 'Перетащить весь отдел' }),
    ).toBeEnabled();
  });

  it('keeps server-backed Department reorder disabled for Department Admin', async () => {
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(
      serverPlannerSnapshot(),
    );

    const departmentAdmin: AuthUser = {
      ...managementUser,
      memberships: [
        {
          id: 'department-admin-membership',
          role: 'DEPARTMENT_ADMIN',
          departmentId: 'server-department',
        },
      ],
    };

    render(
      <AppThemeProvider>
        <MemoryRouter>
          <AuthUserContext.Provider value={departmentAdmin}>
            <App />
          </AuthUserContext.Provider>
        </MemoryRouter>
      </AppThemeProvider>,
    );

    await screen.findByText('Серверный сотрудник');
    expect(
      screen.getByRole('button', {
        name: 'Изменение порядка отделов сейчас недоступно',
      }),
    ).toBeDisabled();
  });

  it('creates a Department through the backend for Super Admin', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    const createDepartmentSpy = vi
      .spyOn(plannerApi, 'createPlannerDepartment')
      .mockResolvedValue({
        id: 'new-department',
        name: 'Новый отдел',
        kind: 'GENERAL',
        position: 1,
        updatedAt: '2026-09-22T08:00:00.000Z',
        isActive: true,
        createdAt: '2026-09-22T08:00:00.000Z',
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(screen.getByRole('button', { name: 'Отделы' }));
    await user.type(
      screen.getByPlaceholderText('Название отдела'),
      'Новый отдел',
    );
    await user.click(screen.getByRole('button', { name: 'Создать отдел' }));

    await waitFor(() => {
      expect(createDepartmentSpy).toHaveBeenCalledWith({
        name: 'Новый отдел',
        kind: 'general',
      });
    });
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('renames a Department through the backend with optimistic metadata', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    vi.spyOn(window, 'prompt').mockReturnValue('Новый Front Office');
    const updateDepartmentSpy = vi
      .spyOn(plannerApi, 'updatePlannerDepartment')
      .mockResolvedValue({
        id: 'server-department',
        name: 'Новый Front Office',
        kind: 'FO',
        position: 0,
        updatedAt: '2026-09-22T08:01:00.000Z',
        isActive: true,
        createdAt: '2026-09-20T08:00:00.000Z',
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(screen.getByRole('button', { name: 'Отделы' }));
    await user.click(screen.getByRole('button', { name: 'Переименовать' }));

    await waitFor(() => {
      expect(updateDepartmentSpy).toHaveBeenCalledWith(
        'server-department',
        {
          name: 'Новый Front Office',
          expectedUpdatedAt:
            snapshot.departmentMetadata['server-department'].updatedAt,
        },
      );
    });
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('deactivates an empty Department through the backend without deleting history locally', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    snapshot.departments.push({
      id: 'empty-department',
      name: 'Пустой отдел',
      kind: 'general',
    });
    snapshot.departmentMetadata['empty-department'] = {
      updatedAt: '2026-09-22T07:00:00.000Z',
    };

    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deactivateSpy = vi
      .spyOn(plannerApi, 'deactivatePlannerDepartment')
      .mockResolvedValue({
        status: 'ok',
        departmentId: 'empty-department',
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(screen.getByRole('button', { name: 'Отделы' }));
    const deactivateButtons = screen.getAllByRole('button', {
      name: 'Деактивировать пустой отдел',
    });
    await user.click(deactivateButtons[1]);

    await waitFor(() => {
      expect(deactivateSpy).toHaveBeenCalledWith(
        'empty-department',
        '2026-09-22T07:00:00.000Z',
      );
    });
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('writes one server-backed schedule cell with optimistic metadata in write pilot mode', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    const applySpy = vi
      .spyOn(plannerApi, 'applyDepartmentScheduleChanges')
      .mockResolvedValue({
        status: 'ok',
        applied: 1,
        schedule: {
          id: 'schedule-current',
          updatedAt: '2026-09-19T12:00:00.000Z',
        },
      });

    renderApp();

    await user.click(await screen.findByText('08:00–17:00'));
    expect(screen.getByText('Смена сотрудника')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отделы' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Сохранить смену' }));

    const now = new Date();
    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith(
        'server-department',
        now.getFullYear(),
        now.getMonth() + 1,
        [
          {
            employeeId: 'server-employee',
            day: 1,
            type: 'shift',
            startTime: '08:00',
            endTime: '17:00',
            code: null,
            expectedUpdatedAt:
              snapshot.cellMetadata['server-employee'][1].updatedAt,
          },
        ],
      );
    });
  });

  it('fills only empty raw cells with OFF through the atomic server batch', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    const now = new Date();

    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    const applySpy = vi
      .spyOn(plannerApi, 'applyPlannerScheduleChanges')
      .mockResolvedValue({
        status: 'ok',
        applied: 1,
        schedule: {
          id: 'schedule-current',
          updatedAt: '2026-09-22T10:00:00.000Z',
        },
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(
      screen.getByRole('button', { name: 'Управление графиком' }),
    );
    await user.click(screen.getByRole('button', { name: 'OFF всем' }));

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledTimes(1);
    });

    const [year, month, changes] = applySpy.mock.calls[0];
    expect(year).toBe(now.getFullYear());
    expect(month).toBe(now.getMonth() + 1);
    expect(changes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeId: 'server-employee',
          day: 1,
        }),
      ]),
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        {
          employeeId: 'server-employee',
          day: 2,
          type: 'off',
          expectedUpdatedAt: null,
        },
      ]),
    );
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('clears persisted server cells with their optimistic metadata', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    const now = new Date();

    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    const applySpy = vi
      .spyOn(plannerApi, 'applyPlannerScheduleChanges')
      .mockResolvedValue({
        status: 'ok',
        applied: 1,
        schedule: {
          id: 'schedule-current',
          updatedAt: '2026-09-22T10:00:00.000Z',
        },
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(
      screen.getByRole('button', { name: 'Управление графиком' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Очистить месяц' }),
    );

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith(
        now.getFullYear(),
        now.getMonth() + 1,
        [
          {
            employeeId: 'server-employee',
            day: 1,
            type: 'empty',
            expectedUpdatedAt:
              snapshot.cellMetadata['server-employee'][1].updatedAt,
          },
        ],
      );
    });
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('shows inline validation when Employee name is empty', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    const createSpy = vi.spyOn(plannerApi, 'createPlannerEmployee');

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(
      screen.getByRole('button', { name: 'Новый сотрудник' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Добавить сотрудника' }),
    );

    expect(
      await screen.findByText('Введите имя и фамилию сотрудника'),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Например, Иван Иванов'),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('creates an Employee through the backend in server write mode', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    const createSpy = vi
      .spyOn(plannerApi, 'createPlannerEmployee')
      .mockResolvedValue({
        id: 'new-server-employee',
        displayName: 'Новый сотрудник',
        employmentRate: 1,
        scheduleMode: 'FLEXIBLE',
        fixedStartTime: null,
        fixedEndTime: null,
        departmentId: 'server-department',
        position: 1,
        isActive: true,
        isLinked: false,
        updatedAt: '2026-09-19T12:00:00.000Z',
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    expect(screen.getByRole('button', { name: 'Отделы' })).toBeEnabled();

    await user.click(
      screen.getByRole('button', { name: 'Новый сотрудник' }),
    );
    const nameInput = screen.getByPlaceholderText('Например, Иван Иванов');
    expect(nameInput).toBeEnabled();
    await user.clear(nameInput);
    await user.type(nameInput, 'Новый сотрудник');
    await user.click(
      screen.getByRole('button', { name: 'Добавить сотрудника' }),
    );

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        displayName: 'Новый сотрудник',
        departmentId: 'server-department',
        employmentRate: 1,
        scheduleMode: 'FLEXIBLE',
        fixedStartTime: null,
        fixedEndTime: null,
      });
    });
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('edits an Employee through the backend with optimistic metadata', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    const updateSpy = vi
      .spyOn(plannerApi, 'updatePlannerEmployee')
      .mockResolvedValue({
        id: 'server-employee',
        displayName: 'Обновлённый сотрудник',
        employmentRate: 1,
        scheduleMode: 'FLEXIBLE',
        fixedStartTime: null,
        fixedEndTime: null,
        departmentId: 'server-department',
        position: 0,
        isActive: true,
        isLinked: false,
        updatedAt: '2026-09-22T10:00:00.000Z',
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(
      screen.getByRole('button', { name: 'Редактировать сотрудника' }),
    );

    expect(
      screen.getByText('Редактирование сотрудника'),
    ).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('Серверный сотрудник');
    await user.clear(nameInput);
    await user.type(nameInput, 'Обновлённый сотрудник');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('server-employee', {
        displayName: 'Обновлённый сотрудник',
        departmentId: 'server-department',
        employmentRate: 1,
        scheduleMode: 'FLEXIBLE',
        fixedStartTime: null,
        fixedEndTime: null,
        expectedUpdatedAt:
          snapshot.employeeMetadata['server-employee'].updatedAt,
      });
    });
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('soft-deactivates an Employee through the backend with optimistic metadata', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deactivateSpy = vi
      .spyOn(plannerApi, 'deactivatePlannerEmployee')
      .mockResolvedValue({
        status: 'ok',
        employeeId: 'server-employee',
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(
      screen.getByRole('button', {
        name: 'Деактивировать / удалить сотрудника',
      }),
    );

    await waitFor(() => {
      expect(deactivateSpy).toHaveBeenCalledWith(
        'server-employee',
        snapshot.employeeMetadata['server-employee'].updatedAt,
      );
    });
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('creates an Employee wish through the backend in server write mode', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    const now = new Date();
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    const createWishSpy = vi
      .spyOn(plannerApi, 'createPlannerWish')
      .mockResolvedValue({
        id: 'wish-created',
        employeeId: 'server-employee',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: null,
        text: 'Желательно выходной',
        createdAt: '2026-09-22T10:00:00.000Z',
        updatedAt: '2026-09-22T10:00:00.000Z',
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(screen.getByTitle('Добавить пожелания по графику'));
    await user.type(
      screen.getByPlaceholderText(/Например: выходной/),
      'Желательно выходной',
    );
    await user.click(
      screen.getByRole('button', { name: 'Добавить пожелание' }),
    );

    await waitFor(() => {
      expect(createWishSpy).toHaveBeenCalledWith({
        employeeId: 'server-employee',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: null,
        text: 'Желательно выходной',
      });
    });
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('deletes a persisted Employee wish by its server id', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    snapshot.wishes['server-employee'][currentPeriodKey()] = [
      {
        id: 'server-wish',
        day: null,
        text: 'Без поздних смен',
      },
    ];

    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    const deleteWishSpy = vi
      .spyOn(plannerApi, 'deletePlannerWish')
      .mockResolvedValue({
        status: 'ok',
        wishId: 'server-wish',
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(screen.getByTitle(/Пожелания:/));
    expect(screen.getByText('Без поздних смен')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Удалить пожелание' }),
    );

    await waitFor(() => {
      expect(deleteWishSpy).toHaveBeenCalledWith('server-wish');
    });
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('updates Employee rate through the backend with optimistic metadata', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    const updateSpy = vi
      .spyOn(plannerApi, 'updatePlannerEmployee')
      .mockResolvedValue({
        id: 'server-employee',
        displayName: 'Серверный сотрудник',
        employmentRate: 0.75,
        scheduleMode: 'FLEXIBLE',
        fixedStartTime: null,
        fixedEndTime: null,
        departmentId: 'server-department',
        position: 0,
        isActive: true,
        isLinked: false,
        updatedAt: '2026-09-19T12:00:00.000Z',
      });

    renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(screen.getByRole('button', { name: 'День / ночь' }));

    const rateSelect = screen.getByTitle('Ставка сотрудника');
    expect(rateSelect).toBeEnabled();
    await user.selectOptions(rateSelect, '0.75');

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('server-employee', {
        employmentRate: 0.75,
        expectedUpdatedAt:
          snapshot.employeeMetadata['server-employee'].updatedAt,
      });
    });
    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
  });

  it('switches from schedule values to day/night/total hours', async () => {
    const user = userEvent.setup();
    seedCurrentSchedule();
    renderApp();

    expect(screen.getByText('15:00–23:00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'День / ночь' }));

    expect(screen.getByText('Д 6')).toBeInTheDocument();
    expect(screen.getByText('Н 1')).toBeInTheDocument();
    expect(screen.getByText('Σ 7')).toBeInTheDocument();
    expect(screen.getByText('Недельная норма')).toBeInTheDocument();
  });

  it('switches back from day/night hours to the editable schedule view', async () => {
    const user = userEvent.setup();
    seedCurrentSchedule();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'День / ночь' }));
    expect(screen.getByText('Недельная норма')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'График' }));

    expect(screen.getByText('15:00–23:00')).toBeInTheDocument();
    expect(screen.queryByText('Недельная норма')).not.toBeInTheDocument();
  });

  it('migrates a legacy single-month schedule and fills department/rate defaults', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        employees: [{ id: 'legacy', name: 'Legacy Employee' }],
        schedule: {
          legacy: {
            1: {
              type: 'shift',
              shift: { start: '08:00', end: '17:00' },
            },
          },
        },
      }),
    );

    renderApp();

    expect(screen.getByText('Legacy Employee')).toBeInTheDocument();
    expect(screen.getByText('08:00–17:00')).toBeInTheDocument();

    await waitFor(() => {
      const migrated = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(migrated.employees[0]).toMatchObject({
        id: 'legacy',
        departmentId: 'front-office',
        employmentRate: 1,
      });
      expect(migrated.schedules[currentPeriodKey()].legacy[1]).toEqual({
        type: 'shift',
        shift: { start: '08:00', end: '17:00' },
      });
      expect(migrated.schedule).toBeUndefined();
    });
  });

  it('sanitizes an unsupported rate and removes unknown collapsed departments', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        departments: [{ id: 'known', name: 'Известный отдел', kind: 'general' }],
        employees: [
          {
            id: 'employee',
            name: 'Тестовый сотрудник',
            departmentId: 'known',
            employmentRate: 0.6,
          },
        ],
        schedules: {},
        wishes: {},
        collapsedDepartments: ['known', 'missing'],
      }),
    );

    renderApp();

    await waitFor(() => {
      const migrated = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(migrated.employees[0].employmentRate).toBe(1);
      expect(migrated.collapsedDepartments).toEqual(['known']);
    });
  });

  it('applies Excel import through the atomic server planner endpoint in write mode', async () => {
    const user = userEvent.setup();
    const snapshot = serverPlannerSnapshot();
    const now = new Date();
    const preview: excelImport.ExcelImportPreview = {
      fileName: 'server-import.xlsx',
      sheetName: 'График',
      detectedDays: [2],
      entries: [
        {
          employeeName: 'Серверный сотрудник',
          employeeId: 'server-employee',
          day: 2,
          value: '15:00-23:00',
        },
      ],
      matchedEmployees: ['Серверный сотрудник'],
      unknownEmployees: [],
      ambiguousEmployees: [],
      invalidCells: [],
      warnings: [],
    };

    vi.stubEnv('VITE_SERVER_PLANNER_WRITE', '1');
    vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue(snapshot);
    vi.spyOn(excelImport, 'parseScheduleExcel').mockResolvedValue(preview);
    const applySpy = vi
      .spyOn(plannerApi, 'applyPlannerScheduleChanges')
      .mockResolvedValue({
        status: 'ok',
        applied: 1,
        schedule: {
          id: 'schedule-current',
          updatedAt: '2026-09-22T10:00:00.000Z',
        },
      });

    const { container } = renderApp();

    await screen.findByText('Серверный сотрудник');
    await user.click(
      screen.getByRole('button', { name: 'Управление графиком' }),
    );
    const importButton = screen.getByRole('button', { name: 'Импорт Excel' });
    expect(importButton).toBeEnabled();

    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['content'], 'server-import.xlsx')],
      },
    });

    expect(await screen.findByText('Предпросмотр импорта')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Применить импорт' }));

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith(
        now.getFullYear(),
        now.getMonth() + 1,
        [
          {
            employeeId: 'server-employee',
            day: 2,
            type: 'shift',
            startTime: '15:00',
            endTime: '23:00',
            code: null,
            expectedUpdatedAt: null,
          },
        ],
      );
    });

    expect(plannerApi.loadPlannerServerSnapshot).toHaveBeenCalledTimes(2);
    expect(window.alert).toHaveBeenLastCalledWith('Импортировано смен: 1');
  });

  it('protects a filled cell by default and overwrites only after confirmation', async () => {
    const user = userEvent.setup();
    seedCurrentSchedule('08:00-17:00');
    const preview: excelImport.ExcelImportPreview = {
      fileName: 'import.xlsx',
      sheetName: 'График',
      detectedDays: [1],
      entries: [
        {
          employeeName: 'Тестовый сотрудник',
          employeeId: 'employee',
          day: 1,
          value: '15:00-23:00',
        },
      ],
      matchedEmployees: ['Тестовый сотрудник'],
      unknownEmployees: [],
      ambiguousEmployees: [],
      invalidCells: [],
      warnings: [],
    };
    vi.spyOn(excelImport, 'parseScheduleExcel').mockResolvedValue(preview);
    const { container } = renderApp();
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['content'], 'import.xlsx');

    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByText('Предпросмотр импорта')).toBeInTheDocument();
    expect(screen.getByText('Конфликтов с текущим графиком')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Применить импорт' }));

    expect(window.alert).toHaveBeenLastCalledWith(
      'Импортировано смен: 0\nЗащищено заполненных ячеек: 1',
    );
    expect(screen.getByText('08:00–17:00')).toBeInTheDocument();

    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByText('Предпросмотр импорта')).toBeInTheDocument();
    await user.click(
      screen.getByRole('checkbox', { name: /Перезаписывать заполненные ячейки/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Применить импорт' }));

    expect(window.alert).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('15:00–23:00')).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(stored.schedules[currentPeriodKey()].employee[1].shift).toEqual({
        start: '15:00',
        end: '23:00',
      });
    });
  });
  it('reports imported and out-of-month counts after applying valid Excel rows', async () => {
    const user = userEvent.setup();
    seedCurrentSchedule();
    const preview: excelImport.ExcelImportPreview = {
      fileName: 'import.xlsx',
      sheetName: 'График',
      detectedDays: [2, 3, 32],
      entries: [
        { employeeName: 'Тестовый сотрудник', employeeId: 'employee', day: 2, value: '08:00-17:00' },
        { employeeName: 'Неизвестный', employeeId: null, day: 3, value: '15:00-23:00' },
        { employeeName: 'Тестовый сотрудник', employeeId: 'employee', day: 32, value: '15:00-23:00' },
      ],
      matchedEmployees: ['Тестовый сотрудник'],
      unknownEmployees: ['Неизвестный'],
      ambiguousEmployees: [],
      invalidCells: [],
      warnings: ['Неизвестные сотрудники не будут импортированы автоматически.'],
    };
    vi.spyOn(excelImport, 'parseScheduleExcel').mockResolvedValue(preview);
    const { container } = renderApp();
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(fileInput, {
      target: { files: [new File(['content'], 'import.xlsx')] },
    });
    expect(await screen.findByText('Предпросмотр импорта')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Применить импорт' }));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(stored.schedules[currentPeriodKey()].employee[2].shift).toEqual({
        start: '08:00',
        end: '17:00',
      });
      expect(stored.schedules[currentPeriodKey()].employee[3]).toBeUndefined();
      expect(stored.schedules[currentPeriodKey()].employee[32]).toBeUndefined();
    });
    expect(window.alert).toHaveBeenLastCalledWith(
      'Импортировано смен: 1\nПропущено дней вне текущего месяца: 1',
    );
  });

});
