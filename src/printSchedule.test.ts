import { describe, expect, it } from 'vitest';

import { getPrintWeekRanges } from './printSchedule';

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
