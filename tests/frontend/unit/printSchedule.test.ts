import { describe, expect, it } from 'vitest';

import {
  getMonthWeekRanges,
  getPrintWeekRanges,
  getRequiredPrintPeriods,
  getVisibleMonthWeekRanges,
} from '../../../src/services/print/printSchedule';

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
