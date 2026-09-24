import { describe, expect, it } from 'vitest';

import { calculateShiftHours } from '../../../src/domain/schedule/shiftHours';
import type { ShiftCode, ShiftEntry } from '../../../src/domain/models';

function shift(
  start: string,
  end: string,
  code?: ShiftCode
): ShiftEntry {
  return {
    type: 'shift',
    shift: {
      start,
      end,
      ...(code ? { code } : {}),
    },
  };
}

describe('paid-hours calculation', () => {
  it('counts 08:00–17:00 as 8 paid daytime hours', () => {
    expect(calculateShiftHours(shift('08:00', '17:00'))).toEqual({
      day: 8,
      night: 0,
      total: 8,
    });
  });

  it('counts 15:00–23:00 as 6 daytime and 1 nighttime hour', () => {
    expect(calculateShiftHours(shift('15:00', '23:00'))).toEqual({
      day: 6,
      night: 1,
      total: 7,
    });
  });

  it('counts nighttime only inside the 22:00–06:00 window', () => {
    expect(calculateShiftHours(shift('22:00', '06:00'))).toEqual({
      day: 0,
      night: 7,
      total: 7,
    });
  });

  it('handles a shift that crosses midnight', () => {
    expect(calculateShiftHours(shift('20:00', '04:00'))).toEqual({
      day: 1,
      night: 6,
      total: 7,
    });
  });

  it.each([
    ['21:00', '06:00', 0, 8, 8],
    ['20:00', '08:00', 3, 8, 11],
    ['05:00', '14:00', 7, 1, 8],
    ['14:00', '23:00', 7, 1, 8],
    ['21:30', '06:00', 0, 7.5, 7.5],
    ['05:00', '07:00', 0, 1, 1],
  ])('splits %s–%s at 22:00/06:00 with one break exactly once', (start, end, day, night, total) => {
    const hours = calculateShiftHours(shift(start, end));
    expect(hours).toEqual({ day, night, total });
    expect(hours.day + hours.night).toBe(hours.total);
  });

  it('deducts a one-hour break from an ordinary shift', () => {
    expect(calculateShiftHours(shift('06:00', '14:00'))).toEqual({
      day: 7,
      night: 0,
      total: 7,
    });
  });

  it('uses a fixed 12 paid hours for N 20:00–08:00', () => {
    expect(calculateShiftHours(shift('20:00', '08:00', 'N'))).toEqual({
      day: 4,
      night: 8,
      total: 12,
    });
  });

  it('uses a fixed 12 paid hours for N 19:30–07:00', () => {
    expect(calculateShiftHours(shift('19:30', '07:00', 'N'))).toEqual({
      day: 4,
      night: 8,
      total: 12,
    });
  });

  it('returns zero for OFF and empty entries', () => {
    expect(calculateShiftHours({ type: 'off' })).toEqual({
      day: 0,
      night: 0,
      total: 0,
    });
    expect(calculateShiftHours({ type: 'empty' })).toEqual({
      day: 0,
      night: 0,
      total: 0,
    });
  });
  it('returns zero for an invalid entry instead of counting it', () => {
    expect(
      calculateShiftHours({ type: 'error', error: 'Некорректная смена' }),
    ).toEqual({ day: 0, night: 0, total: 0 });
  });

  it('deducts the break from night hours when no daytime hours exist', () => {
    expect(calculateShiftHours(shift('23:00', '05:00'))).toEqual({
      day: 0,
      night: 5,
      total: 5,
    });
  });

  it('preserves quarter-hour precision after the break deduction', () => {
    expect(calculateShiftHours(shift('08:15', '17:45'))).toEqual({
      day: 8.5,
      night: 0,
      total: 8.5,
    });
  });

});
