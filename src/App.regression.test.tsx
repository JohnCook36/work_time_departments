import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import * as excelImport from './importExcel';
import * as plannerApi from './plannerApi';
import { AuthUserContext } from './auth/AuthContext';
import type { AuthUser } from './auth/api';

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
    <AuthUserContext.Provider value={managementUser}>
      <App />
    </AuthUserContext.Provider>,
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
    cellMetadata: {
      'server-employee': {
        1: {
          shiftId: 'server-shift',
          updatedAt: year + '-' + month + '-01T10:00:00.000Z',
        },
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
    expect(screen.getByRole('button', { name: 'Сотрудник' })).toBeDisabled();
    expect(screen.getByText('08-17')).toBeInTheDocument();
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

    await user.click(await screen.findByText('08-17'));
    expect(screen.getByText('Смена сотрудника')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сотрудник' })).toBeDisabled();

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

  it('switches from schedule values to day/night/total hours', async () => {
    const user = userEvent.setup();
    seedCurrentSchedule();
    renderApp();

    expect(screen.getByText('15-23')).toBeInTheDocument();

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

    expect(screen.getByText('15-23')).toBeInTheDocument();
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
    expect(screen.getByText('08-17')).toBeInTheDocument();

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
    expect(screen.getByText('08-17')).toBeInTheDocument();

    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByText('Предпросмотр импорта')).toBeInTheDocument();
    await user.click(
      screen.getByRole('checkbox', { name: /Перезаписывать заполненные ячейки/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Применить импорт' }));

    expect(window.alert).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('15-23')).toBeInTheDocument();
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
