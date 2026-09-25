import { ThemeProvider } from '@emotion/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDepartmentSchedulePublication,
  getDepartmentSchedulePublications,
  publishDepartmentSchedule,
  SchedulePublicationResponse,
  validateDepartmentSchedule,
} from '../../../src/api/planner';
import { PlannerScheduleToolsDrawer } from '../../../src/components/drawers/PlannerScheduleToolsDrawer';
import { getTheme } from '../../../src/theme/theme';

vi.mock('../../../src/api/planner', () => ({
  getDepartmentSchedulePublication: vi.fn(),
  getDepartmentSchedulePublications: vi.fn(),
  publishDepartmentSchedule: vi.fn(),
  validateDepartmentSchedule: vi.fn(),
}));

const getPublication = vi.mocked(getDepartmentSchedulePublication);
const getHistory = vi.mocked(getDepartmentSchedulePublications);
const publish = vi.mocked(publishDepartmentSchedule);
const validate = vi.mocked(validateDepartmentSchedule);

function publication(version: number): SchedulePublicationResponse {
  return {
    id: 'publication-' + version,
    scheduleId: 'schedule-1',
    departmentId: 'department-a',
    version,
    publishedByLabel: 'Администратор публикации',
    sourceScheduleUpdatedAt: '2026-09-01T10:00:00.000Z',
    comment: version === 2 ? 'Финальный график' : 'Первая версия',
    rulesVersion: null,
    snapshot: {
      department: {
        id: 'department-a',
        name: 'Front Office',
        kind: 'FO',
      },
      employees: [
        {
          id: 'employee-1',
          displayName: 'Иванов И.И.',
          employmentRate: version === 2 ? 0.75 : 1,
          scheduleMode: 'FLEXIBLE',
          fixedStartTime: null,
          fixedEndTime: null,
        },
      ],
      shifts: [
        {
          id: 'shift-' + version,
          employeeId: 'employee-1',
          date: '2026-09-07',
          code: null,
          startTime: version === 2 ? '09:00' : '08:00',
          endTime: version === 2 ? '18:00' : '17:00',
          isOff: false,
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      ],
    },
    diff: {
      employees:
        version === 2
          ? [
              {
                key: 'employee-1',
                before: {
                  id: 'employee-1',
                  displayName: 'Иванов И.И.',
                  employmentRate: 1,
                  scheduleMode: 'FLEXIBLE',
                  fixedStartTime: null,
                  fixedEndTime: null,
                },
                after: {
                  id: 'employee-1',
                  displayName: 'Иванов И.И.',
                  employmentRate: 0.75,
                  scheduleMode: 'FLEXIBLE',
                  fixedStartTime: null,
                  fixedEndTime: null,
                },
              },
            ]
          : [],
      shifts:
        version === 2
          ? [
              {
                key: 'employee-1:2026-09-07',
                before: {
                  id: 'shift-1',
                  employeeId: 'employee-1',
                  date: '2026-09-07',
                  code: null,
                  startTime: '08:00',
                  endTime: '17:00',
                  isOff: false,
                  updatedAt: '2026-09-01T10:00:00.000Z',
                },
                after: {
                  id: 'shift-2',
                  employeeId: 'employee-1',
                  date: '2026-09-07',
                  code: null,
                  startTime: '09:00',
                  endTime: '18:00',
                  isOff: false,
                  updatedAt: '2026-09-02T10:00:00.000Z',
                },
              },
              {
                key: 'employee-1:2026-09-08',
                before: null,
                after: {
                  id: 'shift-added',
                  employeeId: 'employee-1',
                  date: '2026-09-08',
                  code: null,
                  startTime: '10:00',
                  endTime: '19:00',
                  isOff: false,
                  updatedAt: '2026-09-02T10:00:00.000Z',
                },
              },
            ]
          : [
              {
                key: 'employee-1:2026-09-07',
                before: null,
                after: {
                  id: 'shift-1',
                  employeeId: 'employee-1',
                  date: '2026-09-07',
                  code: null,
                  startTime: '08:00',
                  endTime: '17:00',
                  isOff: false,
                  updatedAt: '2026-09-01T10:00:00.000Z',
                },
              },
            ],
    },
    createdAt: '2026-09-0' + version + 'T09:00:00.000Z',
  };
}

function props() {
  return {
    departments: [
      { id: 'department-a', name: 'Front Office', kind: 'general' as const },
    ],
    employees: [
      {
        id: 'employee-1',
        name: 'Иванов И.И.',
        departmentId: 'department-a',
        employmentRate: 1 as const,
      },
    ],
    year: 2026,
    monthIndex: 8,
    publicationReadEnabled: true,
    canPublishSchedule: true,
    canImportExcel: false,
    isImportingExcel: false,
    isApplyingExcelImport: false,
    onExcelFile: vi.fn(),
    excelRangeKey: 'month',
    onExcelRangeChange: vi.fn(),
    isExportingExcel: false,
    onExportExcel: vi.fn(),
    printRangeKey: 'month',
    onPrintRangeChange: vi.fn(),
    printCalendarWeekRanges: [],
    isPreparingPrint: false,
    onPrint: vi.fn(),
    canBulkEditSchedule: false,
    canSaveFixedWeekdays: false,
    isSavingFixedWeekdays: false,
    onSaveFixedWeekdays: vi.fn(),
    isApplyingBulkSchedule: false,
    onFillOffAll: vi.fn(),
    onClearAll: vi.fn(),
    onNavigateToValidationIssue: vi.fn(),
    onManageRules: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('schedule publication controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validate.mockResolvedValue({
      departmentId: 'department-a',
      period: { year: 2026, month: 9 },
      rulesVersion: 'schedule-publication-rules-v1',
      canPublish: true,
      violations: [],
    });
  });

  it('loads history and publishes the selected department month', async () => {
    getHistory
      .mockResolvedValueOnce([publication(1)])
      .mockResolvedValueOnce([publication(2), publication(1)]);
    publish.mockResolvedValue(publication(2));

    render(
      <ThemeProvider theme={getTheme('light')}>
        <PlannerScheduleToolsDrawer {...props()} />
      </ThemeProvider>,
    );

    expect(await screen.findByText(/^v1 ·/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText('Комментарий к версии'),
      'Финальный график',
    );
    await user.click(
      screen.getByRole('button', { name: 'Опубликовать версию' }),
    );

    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith(
        'department-a',
        2026,
        9,
        'Финальный график',
      );
    });

    expect(await screen.findByText(/^v2 ·/)).toBeInTheDocument();
    expect(screen.getByText('Изменения: смен 2, сотрудников 1')).toBeInTheDocument();
    expect(screen.getByText('Опубликована версия v2.')).toBeInTheDocument();
  });

  it('shows hard validation violations, blocks publish and navigates to the problem cell', async () => {
    getHistory.mockResolvedValue([]);
    validate.mockResolvedValue({
      departmentId: 'department-a',
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
    });
    const drawerProps = props();

    render(
      <ThemeProvider theme={getTheme('light')}>
        <PlannerScheduleToolsDrawer {...drawerProps} />
      </ThemeProvider>,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Проверить график' }),
    );

    expect(
      await screen.findByText(
        'Время начала и окончания рабочей смены не может совпадать.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Иванов И.И. · 2026-09-07')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Опубликовать версию' }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Перейти к ячейке' }),
    );

    expect(drawerProps.onNavigateToValidationIssue).toHaveBeenCalledWith(
      'employee-1',
      '2026-09-07',
    );
    expect(drawerProps.onClose).toHaveBeenCalled();
  });

  it('opens an exact immutable version snapshot from history', async () => {
    getHistory.mockResolvedValue([publication(1)]);
    getPublication.mockResolvedValue(publication(1));

    render(
      <ThemeProvider theme={getTheme('light')}>
        <PlannerScheduleToolsDrawer {...props()} />
      </ThemeProvider>,
    );

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Открыть v1' }),
    );

    await waitFor(() => {
      expect(getPublication).toHaveBeenCalledWith(
        'department-a',
        2026,
        9,
        1,
      );
    });

    expect(screen.getByText('v1 · Front Office')).toBeInTheDocument();
    expect(screen.getByText('Автор: Администратор публикации')).toBeInTheDocument();
    expect(screen.queryByText('user-admin')).not.toBeInTheDocument();
    expect(screen.getByText('Сотрудников: 1 · смен: 1')).toBeInTheDocument();
    expect(
      screen.getByText(/2026-09-07 · employee-1 · 08:00–17:00/),
    ).toBeInTheDocument();
  });

  it('renders immutable publication diff with employee names and before/after values', async () => {
    getHistory.mockResolvedValue([publication(2), publication(1)]);
    getPublication.mockResolvedValue(publication(2));

    render(
      <ThemeProvider theme={getTheme('light')}>
        <PlannerScheduleToolsDrawer {...props()} />
      </ThemeProvider>,
    );

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Открыть v2' }),
    );

    expect(await screen.findByText('Изменения смен')).toBeInTheDocument();
    expect(
      screen.getByText('Иванов И.И. · 2026-09-07'),
    ).toBeInTheDocument();
    expect(screen.getByText('Было: 08:00–17:00')).toBeInTheDocument();
    expect(screen.getByText('Стало: 09:00–18:00')).toBeInTheDocument();
    expect(
      screen.getByText('Иванов И.И. · 2026-09-08'),
    ).toBeInTheDocument();
    expect(screen.getByText('Было: нет смены')).toBeInTheDocument();
    expect(screen.getByText('Стало: 10:00–19:00')).toBeInTheDocument();

    expect(await screen.findByText('Изменения сотрудников')).toBeInTheDocument();
    expect(
      screen.getByText('Было: Иванов И.И. · ставка 1 · FLEXIBLE'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Стало: Иванов И.И. · ставка 0.75 · FLEXIBLE'),
    ).toBeInTheDocument();
    expect(screen.queryByText('employee-1 · 2026-09-07')).not.toBeInTheDocument();
  });

  it('does not call publication API in local demo mode', async () => {
    render(
      <ThemeProvider theme={getTheme('light')}>
        <PlannerScheduleToolsDrawer
          {...props()}
          publicationReadEnabled={false}
          canPublishSchedule={false}
        />
      </ThemeProvider>,
    );

    expect(
      screen.getByText('История публикаций доступна в серверном режиме.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Опубликовать версию' }),
    ).toBeDisabled();
    expect(getHistory).not.toHaveBeenCalled();
  });
});
