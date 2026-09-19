import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import * as excelImport from './importExcel';

const STORAGE_KEY = 'hotel-shift-planner';

function currentPeriodKey(): string {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
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

  it('switches from schedule values to day/night/total hours', async () => {
    const user = userEvent.setup();
    seedCurrentSchedule();
    render(<App />);

    expect(screen.getByText('15-23')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'День / ночь' }));

    expect(screen.getByText('Д 6')).toBeInTheDocument();
    expect(screen.getByText('Н 1')).toBeInTheDocument();
    expect(screen.getByText('Σ 7')).toBeInTheDocument();
    expect(screen.getByText('Недельная норма')).toBeInTheDocument();
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

    render(<App />);

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
    const { container } = render(<App />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['content'], 'import.xlsx');

    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByText('Предпросмотр импорта')).toBeInTheDocument();
    expect(screen.getByText('Конфликтов с текущим графиком')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Применить импорт' }));

    expect(window.alert).toHaveBeenLastCalledWith('Импортировано смен: 0');
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
});
