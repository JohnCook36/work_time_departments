import { ThemeProvider } from '@emotion/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDepartmentSchedulePublications,
  publishDepartmentSchedule,
} from '../../../src/api/planner';
import { PlannerScheduleToolsDrawer } from '../../../src/components/drawers/PlannerScheduleToolsDrawer';
import { getTheme } from '../../../src/theme/theme';

vi.mock('../../../src/api/planner', () => ({
  getDepartmentSchedulePublications: vi.fn(),
  publishDepartmentSchedule: vi.fn(),
}));

const getHistory = vi.mocked(getDepartmentSchedulePublications);
const publish = vi.mocked(publishDepartmentSchedule);

function publication(version: number) {
  return {
    id: 'publication-' + version,
    scheduleId: 'schedule-1',
    departmentId: 'department-a',
    version,
    publishedByUserId: 'user-admin',
    sourceScheduleUpdatedAt: '2026-09-01T10:00:00.000Z',
    comment: version === 2 ? 'Финальный график' : 'Первая версия',
    rulesVersion: null,
    snapshot: {},
    diff: {
      employees: version === 2 ? [{}] : [],
      shifts: version === 2 ? [{}, {}] : [{}],
    },
    createdAt: '2026-09-0' + version + 'T09:00:00.000Z',
  };
}

function props() {
  return {
    departments: [
      { id: 'department-a', name: 'Front Office', kind: 'general' as const },
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
    onClose: vi.fn(),
  };
}

describe('schedule publication controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(await screen.findByText(/v1/)).toBeInTheDocument();

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
