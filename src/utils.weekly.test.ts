import { describe, expect, it } from 'vitest';

import { getWeeklyNormHours } from './utils';

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
  });
});
