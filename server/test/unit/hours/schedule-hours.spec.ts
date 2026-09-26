import {
  calculatePlannedShiftHours,
  getMonthlyProductionNormHours,
} from '../../../src/hours/schedule-hours';

describe('canonical planned hours engine', () => {
  it('keeps agreed day/night accounting examples', () => {
    expect(calculatePlannedShiftHours('08:00', '17:00')).toEqual({
      day: 8,
      night: 0,
      total: 8,
    });
    expect(calculatePlannedShiftHours('15:00', '23:00')).toEqual({
      day: 6,
      night: 1,
      total: 7,
    });
    expect(calculatePlannedShiftHours('20:00', '08:00', 'N')).toEqual({
      day: 4,
      night: 8,
      total: 12,
    });
  });

  it('uses the production calendar and employment rate for monthly norm', () => {
    expect(getMonthlyProductionNormHours(2026, 9, 1)).toBe(176);
    expect(getMonthlyProductionNormHours(2026, 9, 0.75)).toBe(132);
    expect(getMonthlyProductionNormHours(2026, 9, 0.5)).toBe(88);
  });
});
