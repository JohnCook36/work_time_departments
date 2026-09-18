import { describe, expect, it } from 'vitest';

import { calculateShiftHours } from './utils';
import type { ShiftCode, ShiftEntry } from './types';

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
});
