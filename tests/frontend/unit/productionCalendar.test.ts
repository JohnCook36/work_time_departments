import { describe, expect, it } from 'vitest';

import {
  getRussiaFiveDayNormHours,
  isRussiaFiveDayShortenedDay,
  isRussiaFiveDayWorkingDay,
} from '../../../src/domain/schedule/productionCalendar';

describe('Russian five-day production calendar', () => {
  it('marks 2026 New Year holidays and transferred days off', () => {
    expect(isRussiaFiveDayWorkingDay(2026, 0, 1)).toBe(false);
    expect(isRussiaFiveDayWorkingDay(2026, 0, 8)).toBe(false);
    expect(isRussiaFiveDayWorkingDay(2026, 0, 9)).toBe(false);
    expect(isRussiaFiveDayWorkingDay(2026, 0, 12)).toBe(true);
    expect(isRussiaFiveDayWorkingDay(2026, 11, 31)).toBe(false);
  });

  it('marks transferred holiday days off in spring 2026', () => {
    expect(isRussiaFiveDayWorkingDay(2026, 1, 23)).toBe(false);
    expect(isRussiaFiveDayWorkingDay(2026, 2, 9)).toBe(false);
    expect(isRussiaFiveDayWorkingDay(2026, 4, 11)).toBe(false);
  });

  it('marks shortened pre-holiday workdays in 2026', () => {
    expect(isRussiaFiveDayShortenedDay(2026, 3, 30)).toBe(true);
    expect(getRussiaFiveDayNormHours(2026, 3, 30)).toBe(7);
    expect(isRussiaFiveDayShortenedDay(2026, 10, 3)).toBe(true);
  });
});
