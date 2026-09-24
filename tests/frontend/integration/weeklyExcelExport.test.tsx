import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlannerScheduleTools } from '../../../src/hooks/usePlannerScheduleTools';
import * as plannerApi from '../../../src/api/planner';
import * as excel from '../../../src/services/excel/exportExcel';
import type { SchedulePeriodsData } from '../../../src/domain/models';

const { showMessage } = vi.hoisted(() => ({ showMessage: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../src/components/dialogs/AppDialogProvider', () => ({ useAppDialog: () => ({ showMessage }) }));

function options(server = true) {
  return {
    departments: [{ id: 'd', name: 'Отдел', kind: 'general' as const }],
    employees: [{ id: 'e', name: 'Сотрудник', departmentId: 'd' }],
    schedule: { e: { 1: { type: 'off' as const } } },
    rawSchedule: { e: { 1: { type: 'off' as const } } },
    schedules: { '2026-08': { e: { 31: { type: 'shift', shift: { start: '01:00', end: '02:00' } } } } } as SchedulePeriodsData,
    year: 2026, month: 8, daysInMonth: 30, periodKey: '2026-09',
    serverPlannerReadEnabled: server, serverPlannerWriteEnabled: server,
    serverCellMetadata: {}, updateCurrentSchedule: vi.fn(), refreshServerPlanner: vi.fn(),
  };
}

describe('weekly Excel source orchestration', () => {
  it('loads the required adjacent server period and ignores stale local data', async () => {
    const load = vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue({
      departments: [], employees: [], wishes: {}, cellMetadata: {}, employeeMetadata: {}, departmentMetadata: {},
      schedule: { e: { 31: { type: 'off' } } },
    } as plannerApi.PlannerServerSnapshot);
    const exportSpy = vi.spyOn(excel, 'exportScheduleToExcel').mockResolvedValue();
    const { result } = renderHook(() => usePlannerScheduleTools(options()));
    act(() => result.current.setExcelRangeKey('week:2026-08-31'));
    await act(async () => { await result.current.handleExportExcel(); });
    expect(load.mock.calls).toEqual([[2026, 8]]);
    expect(exportSpy).toHaveBeenCalledOnce();
    expect(exportSpy.mock.calls[0][0].schedules?.['2026-08'].e[31]).toEqual({ type: 'off' });
    expect(exportSpy.mock.calls[0][0].rangeKey).toBe('week:2026-08-31');
    expect(result.current.isExportingExcel).toBe(false);
  });

  it('does not download an incomplete week when the adjacent request fails and allows retry', async () => {
    const load = vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ schedule: {} } as plannerApi.PlannerServerSnapshot);
    const exportSpy = vi.spyOn(excel, 'exportScheduleToExcel').mockResolvedValue();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => usePlannerScheduleTools(options()));
    act(() => result.current.setExcelRangeKey('week:2026-08-31'));
    await act(async () => { await result.current.handleExportExcel(); });
    expect(exportSpy).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledWith('Не удалось сформировать Excel-файл.');
    expect(result.current.isExportingExcel).toBe(false);
    await act(async () => { await result.current.handleExportExcel(); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(exportSpy).toHaveBeenCalledOnce();
  });

  it.each(['month', 'week:2026-09-07'])('does not request neighboring months for %s', async (rangeKey) => {
    const load = vi.spyOn(plannerApi, 'loadPlannerServerSnapshot');
    const exportSpy = vi.spyOn(excel, 'exportScheduleToExcel').mockResolvedValue();
    const { result } = renderHook(() => usePlannerScheduleTools(options()));
    act(() => result.current.setExcelRangeKey(rangeKey));
    await act(async () => { await result.current.handleExportExcel(); });
    expect(load).not.toHaveBeenCalled();
    expect(exportSpy.mock.calls[0][0].schedule).toEqual(options().schedule);
  });

  it('loads next January for a December boundary week', async () => {
    const load = vi.spyOn(plannerApi, 'loadPlannerServerSnapshot').mockResolvedValue({ schedule: {} } as plannerApi.PlannerServerSnapshot);
    vi.spyOn(excel, 'exportScheduleToExcel').mockResolvedValue();
    const { result } = renderHook(() => usePlannerScheduleTools({ ...options(), year: 2026, month: 11, daysInMonth: 31, periodKey: '2026-12' }));
    act(() => result.current.setExcelRangeKey('week:2026-12-28'));
    await act(async () => { await result.current.handleExportExcel(); });
    expect(load.mock.calls).toEqual([[2027, 1]]);
  });

  it('uses saved periods and fixed-weekday defaults in local mode', async () => {
    const load = vi.spyOn(plannerApi, 'loadPlannerServerSnapshot');
    const exportSpy = vi.spyOn(excel, 'exportScheduleToExcel').mockResolvedValue();
    const config = options(false);
    const { result } = renderHook(() => usePlannerScheduleTools({ ...config, employees: [
      ...config.employees,
      { id: 'fixed', name: 'Шаблон', departmentId: 'd', scheduleMode: 'fixed-weekdays', fixedStartTime: '09:00', fixedEndTime: '18:00' },
    ] }));
    act(() => result.current.setExcelRangeKey('week:2026-08-31'));
    await act(async () => { await result.current.handleExportExcel(); });
    expect(load).not.toHaveBeenCalled();
    const periods = exportSpy.mock.calls[0][0].schedules!;
    expect(periods['2026-08'].e[31]).toEqual(config.schedules['2026-08'].e[31]);
    expect(periods['2026-08'].fixed[31]).toEqual({ type: 'shift', shift: { start: '09:00', end: '18:00' } });
  });

  it('resets Excel range when navigating months without changing print selection', async () => {
    const { result, rerender } = renderHook(({ month }) => usePlannerScheduleTools({ ...options(), month }), { initialProps: { month: 8 } });
    act(() => result.current.setExcelRangeKey('week:2026-08-31'));
    expect(result.current.printRangeKey).toBe('month');
    rerender({ month: 9 });
    await waitFor(() => expect(result.current.excelRangeKey).toBe('month'));
  });
});
