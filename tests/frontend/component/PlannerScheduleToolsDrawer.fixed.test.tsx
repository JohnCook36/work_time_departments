import { ThemeProvider } from '@emotion/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PlannerScheduleToolsDrawer } from '../../../src/components/drawers/PlannerScheduleToolsDrawer';
import { getTheme } from '../../../src/theme/theme';

describe('5/2 action in schedule management', () => {
  it('saves through the existing drawer only when server planning is available', async () => {
    const onSaveFixedWeekdays = vi.fn();
    const props = {
      departments: [{ id: 'department-a', name: 'Front Office', kind: 'general' as const }],
      employees: [],
      year: 2026, monthIndex: 8, publicationReadEnabled: false, canPublishSchedule: false,
      canImportExcel: false, isImportingExcel: false, isApplyingExcelImport: false,
      onExcelFile: vi.fn(), excelRangeKey: 'month', onExcelRangeChange: vi.fn(),
      isExportingExcel: false, onExportExcel: vi.fn(), printRangeKey: 'month',
      onPrintRangeChange: vi.fn(), printCalendarWeekRanges: [], isPreparingPrint: false,
      onPrint: vi.fn(), canBulkEditSchedule: false, isApplyingBulkSchedule: false,
      onFillOffAll: vi.fn(), onClearAll: vi.fn(), onNavigateToValidationIssue: vi.fn(), onManageRules: vi.fn(), onClose: vi.fn(),
      canSaveFixedWeekdays: true, isSavingFixedWeekdays: false, onSaveFixedWeekdays,
    };
    const { rerender } = render(
      <ThemeProvider theme={getTheme('light')}><PlannerScheduleToolsDrawer {...props} /></ThemeProvider>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Сохранить график 5/2' }));
    expect(onSaveFixedWeekdays).toHaveBeenCalledOnce();
    rerender(
      <ThemeProvider theme={getTheme('light')}>
        <PlannerScheduleToolsDrawer {...props} canSaveFixedWeekdays={false} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Сохранить график 5/2' })).toBeDisabled();
  });
});
