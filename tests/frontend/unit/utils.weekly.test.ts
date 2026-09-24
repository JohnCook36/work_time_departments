import { describe, expect, it } from 'vitest';

import { getWeeklyNormHours } from '../../../src/domain/schedule/shiftHours';

describe('getWeeklyNormHours', () => {
  it('uses 40 hours for a full Monday-Friday week at 1.0 rate', () => {
    expect(getWeeklyNormHours(2026, 8, 14, 20, 1)).toBe(40);
  });

  it('scales a full week for 0.75 and 0.5 rates', () => {
    expect(getWeeklyNormHours(2026, 8, 14, 20, 0.75)).toBe(30);
    expect(getWeeklyNormHours(2026, 8, 14, 20, 0.5)).toBe(20);
  });

  it('prorates a partial visible week by included weekdays', () => {
    expect(getWeeklyNormHours(2026, 8, 16, 20, 1)).toBe(24);
    expect(getWeeklyNormHours(2026, 8, 1, 6, 1)).toBe(32);
    expect(getWeeklyNormHours(2026, 8, 28, 30, 0.75)).toBe(18);
  });
  it('returns zero when the selected range contains only a weekend', () => {
    expect(getWeeklyNormHours(2026, 8, 19, 20, 1)).toBe(0);
  });

  it('scales a partial week using the employee rate', () => {
    expect(getWeeklyNormHours(2026, 8, 16, 20, 0.75)).toBe(18);
    expect(getWeeklyNormHours(2026, 8, 16, 20, 0.5)).toBe(12);
  });

  it('uses the production calendar for New Year holidays', () => {
    expect(getWeeklyNormHours(2026, 0, 1, 4, 1)).toBe(0);
    expect(getWeeklyNormHours(2026, 0, 5, 11, 1)).toBe(0);
    expect(getWeeklyNormHours(2026, 0, 5, 11, 0.75)).toBe(0);
    expect(getWeeklyNormHours(2026, 0, 12, 18, 1)).toBe(40);
  });

  it('accounts for a shortened pre-holiday workday', () => {
    expect(getWeeklyNormHours(2026, 3, 27, 30, 1)).toBe(31);
    expect(getWeeklyNormHours(2026, 3, 27, 30, 0.75)).toBe(23.25);
    expect(getWeeklyNormHours(2026, 3, 27, 30, 0.5)).toBe(15.5);
  });
});
