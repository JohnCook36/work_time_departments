import { describe, expect, it } from 'vitest';

import { getMonthWeekRanges } from './printSchedule';

describe('getMonthWeekRanges', () => {
  it('splits a month into Monday-Sunday calendar ranges', () => {
    expect(getMonthWeekRanges(2026, 8, 30)).toEqual([
      { key: '1', start: 1, end: 6, label: '1–6' },
      { key: '2', start: 7, end: 13, label: '7–13' },
      { key: '3', start: 14, end: 20, label: '14–20' },
      { key: '4', start: 21, end: 27, label: '21–27' },
      { key: '5', start: 28, end: 30, label: '28–30' },
    ]);
  });

  it('keeps a Sunday-only opening range separate', () => {
    expect(getMonthWeekRanges(2026, 10, 30)[0]).toEqual({
      key: '1',
      start: 1,
      end: 1,
      label: '1',
    });
  });

  it('does not create ranges outside a short February', () => {
    const ranges = getMonthWeekRanges(2024, 1, 29);

    expect(ranges[ranges.length - 1]).toEqual({
      key: '5',
      start: 26,
      end: 29,
      label: '26–29',
    });
  });
});
