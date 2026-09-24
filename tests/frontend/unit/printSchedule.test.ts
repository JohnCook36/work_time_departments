import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getMonthWeekRanges,
  getPrintWeekRanges,
  getRequiredPrintPeriods,
  getVisibleMonthWeekRanges,
  printSchedule,
} from '../../../src/services/print/printSchedule';
import type { Department, Employee, SchedulePeriodsData } from '../../../src/domain/models';

describe('getPrintWeekRanges', () => {
  it('keeps the first visible week complete when it starts in the previous month', () => {
    const ranges = getPrintWeekRanges(2026, 8);

    expect(ranges[0]).toEqual({
      key: 'week:2026-08-31',
      label: '31 авг – 6 сен',
      days: [
        { year: 2026, month: 7, day: 31 },
        { year: 2026, month: 8, day: 1 },
        { year: 2026, month: 8, day: 2 },
        { year: 2026, month: 8, day: 3 },
        { year: 2026, month: 8, day: 4 },
        { year: 2026, month: 8, day: 5 },
        { year: 2026, month: 8, day: 6 },
      ],
    });
  });

  it('keeps the last visible week complete when it ends in the next month', () => {
    const ranges = getPrintWeekRanges(2026, 8);
    const last = ranges[ranges.length - 1];

    expect(last.key).toBe('week:2026-09-28');
    expect(last.label).toBe('28 сен – 4 окт');
    expect(last.days).toHaveLength(7);
    expect(last.days[6]).toEqual({ year: 2026, month: 9, day: 4 });
  });

  it('labels a week across the year boundary unambiguously', () => {
    const ranges = getPrintWeekRanges(2024, 11);
    const last = ranges[ranges.length - 1];

    expect(last.label).toBe('30 дек 2024 – 5 янв 2025');
    expect(last.days[0]).toEqual({ year: 2024, month: 11, day: 30 });
    expect(last.days[6]).toEqual({ year: 2025, month: 0, day: 5 });
  });
});


describe('getMonthWeekRanges', () => {
  it('uses complete Monday-Sunday ranges across month boundaries', () => {
    const ranges = getMonthWeekRanges(2026, 8, 30);

    expect(ranges[0]).toEqual({
      key: 'week:2026-08-31',
      label: '31 авг – 6 сен',
      days: [
        { year: 2026, month: 7, day: 31 },
        { year: 2026, month: 8, day: 1 },
        { year: 2026, month: 8, day: 2 },
        { year: 2026, month: 8, day: 3 },
        { year: 2026, month: 8, day: 4 },
        { year: 2026, month: 8, day: 5 },
        { year: 2026, month: 8, day: 6 },
      ],
    });

    const last = ranges[ranges.length - 1];
    expect(last.label).toBe('28 сен – 4 окт');
    expect(last.days).toHaveLength(7);
    expect(last.days[6]).toEqual({ year: 2026, month: 9, day: 4 });
  });
});


describe('getRequiredPrintPeriods', () => {
  it('returns previous/current/next periods for a full month with boundary weeks', () => {
    expect(getRequiredPrintPeriods(2026, 8, 'month')).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
  });

  it('loads only the periods touched by the selected week', () => {
    expect(
      getRequiredPrintPeriods(2026, 8, 'week:2026-08-31'),
    ).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);

    expect(
      getRequiredPrintPeriods(2026, 8, 'week:2026-09-28'),
    ).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
  });

  it('returns no periods for an unknown week key', () => {
    expect(
      getRequiredPrintPeriods(2026, 8, 'week:missing'),
    ).toEqual([]);
  });
});

describe('getVisibleMonthWeekRanges', () => {
  it('splits the visible month into Monday-Sunday ranges', () => {
    expect(getVisibleMonthWeekRanges(2026, 8, 30)).toEqual([
      { key: '1', start: 1, end: 6, label: '1–6' },
      { key: '2', start: 7, end: 13, label: '7–13' },
      { key: '3', start: 14, end: 20, label: '14–20' },
      { key: '4', start: 21, end: 27, label: '21–27' },
      { key: '5', start: 28, end: 30, label: '28–30' },
    ]);
  });

  it('keeps a Sunday-only opening range separate for month-visible calculations', () => {
    expect(getVisibleMonthWeekRanges(2026, 10, 30)[0]).toEqual({
      key: '1',
      start: 1,
      end: 1,
      label: '1',
    });
  });

  it('does not create visible ranges outside a short February', () => {
    const ranges = getVisibleMonthWeekRanges(2024, 1, 29);
    expect(ranges[ranges.length - 1]).toEqual({
      key: '5',
      start: 26,
      end: 29,
      label: '26–29',
    });
  });
});

describe('printSchedule popup content', () => {
  afterEach(() => vi.restoreAllMocks());

  const departments: Department[] = [
    { id: 'second', name: 'Второй отдел', kind: 'general' },
    { id: 'first', name: 'Первый отдел', kind: 'general' },
  ];
  const employees: Employee[] = [
    { id: 'a', name: 'Алина', departmentId: 'second' },
    { id: 'b', name: 'Борис', departmentId: 'first' },
    { id: 'c', name: 'Светлана', departmentId: 'second' },
  ];
  const schedules: SchedulePeriodsData = {
    '2026-08': { a: { 31: { type: 'shift', shift: { start: '20:00', end: '08:00', code: 'N' } } } },
    '2026-09': { a: {
      1: { type: 'shift', shift: { start: '08:00', end: '17:00', code: 'E' } },
      2: { type: 'off' },
      3: { type: 'error', error: 'Ошибка смены' },
      7: { type: 'shift', shift: { start: '09:00', end: '17:00' } },
      28: { type: 'shift', shift: { start: '08:00', end: '17:00' } },
    } },
    '2026-10': { a: { 1: { type: 'shift', shift: { start: '10:00', end: '18:00' } }, 4: { type: 'off' } } },
  };

  function openPrint(rangeKey: string) {
    let html = '';
    const popup = {
      opener: window,
      document: {
        open: vi.fn(),
        write: vi.fn((content: string) => { html = content; }),
        close: vi.fn(),
      },
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const result = printSchedule({
      departments, employees,
      schedule: schedules['2026-09'], schedules,
      year: 2026, month: 8, daysInMonth: 30, rangeKey,
    });
    expect(result).toBe('opened');
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(popup.opener).toBeNull();
    expect(popup.document.close).toHaveBeenCalledOnce();
    expect(html).toContain('size: A4 landscape');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return { doc, html };
  }

  it('prints the whole month as full calendar-week pages in planner order', () => {
    const { doc } = openPrint('month');
    const weeks = [...doc.querySelectorAll('section.week')];
    expect(weeks).toHaveLength(5);
    expect(weeks[0].querySelector('.week-title')?.textContent).toContain('31 авг – 6 сен');
    expect(weeks[4].querySelector('.week-title')?.textContent).toContain('28 сен – 4 окт');
    for (const week of weeks) {
      expect(week.querySelectorAll('th.day-head')).toHaveLength(7);
      expect([...week.querySelectorAll('td.employee')].map((cell) => cell.textContent))
        .toEqual(['Алина', 'Светлана', 'Борис']);
      expect([...week.querySelectorAll('tr.department-row')].map((row) => row.textContent))
        .toEqual(['Второй отдел · 2 сотрудников', 'Первый отдел · 1 сотрудников']);
    }
  });

  it('prints only a selected in-month Monday–Sunday week with its own hours', () => {
    const { doc } = openPrint('week:2026-09-07');
    expect(doc.querySelectorAll('section.week')).toHaveLength(1);
    expect([...doc.querySelectorAll('th.day-head strong')].map((cell) => cell.textContent))
      .toEqual(['7', '8', '9', '10', '11', '12', '13']);
    const firstRow = doc.querySelector('td.employee')?.parentElement;
    expect(firstRow?.querySelector('.shift-time')?.textContent).toBe('09:00-17:00');
    expect(firstRow?.querySelector('.hours')?.textContent).toBe('7');
    expect(doc.body.textContent).not.toContain('20:00-08:00');
  });

  it('prints prior-month cells, OFF/error/empty and only selected-week hours', () => {
    const { doc } = openPrint('week:2026-08-31');
    expect(doc.querySelectorAll('section.week')).toHaveLength(1);
    expect([...doc.querySelectorAll('th.day-head')].map((cell) => cell.textContent?.trim()))
      .toEqual(['Пн31авг', 'Вт1сен', 'Ср2сен', 'Чт3сен', 'Пт4сен', 'Сб5сен', 'Вс6сен']);
    const row = doc.querySelector('td.employee')?.parentElement;
    const cells = [...(row?.querySelectorAll('td.shift-cell') || [])];
    expect(cells).toHaveLength(7);
    expect(cells[0].querySelector('.shift-time')?.textContent).toBe('20:00-08:00');
    expect(cells[1].querySelector('.shift-time')?.textContent).toBe('08:00-17:00');
    expect(cells[2].textContent).toBe('OFF');
    expect(cells[3].textContent).toBe('⚠');
    expect(cells[4].textContent).toBe('');
    expect(row?.querySelector('.hours')?.textContent).toBe('20');
  });

  it('prints seven days through October with next-month data and no earlier weeks', () => {
    const { doc } = openPrint('week:2026-09-28');
    expect(doc.querySelectorAll('section.week')).toHaveLength(1);
    expect([...doc.querySelectorAll('th.day-head')].map((cell) => cell.textContent?.trim()))
      .toEqual(['Пн28сен', 'Вт29сен', 'Ср30сен', 'Чт1окт', 'Пт2окт', 'Сб3окт', 'Вс4окт']);
    const row = doc.querySelector('td.employee')?.parentElement;
    expect(row?.querySelectorAll('td.shift-cell')).toHaveLength(7);
    expect(row?.querySelectorAll('.shift-time')[1].textContent).toBe('10:00-18:00');
    expect(row?.querySelectorAll('td.shift-cell')[6].textContent).toBe('OFF');
    expect(row?.querySelector('.hours')?.textContent).toBe('15');
    expect(doc.body.textContent).not.toContain('20:00-08:00');
  });

  it('reports a blocked popup without writing to another window', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(printSchedule({
      departments, employees, schedule: schedules['2026-09'], schedules,
      year: 2026, month: 8, daysInMonth: 30, rangeKey: 'week:2026-09-28',
    })).toBe('blocked');
    expect(open).toHaveBeenCalledOnce();
  });
});
