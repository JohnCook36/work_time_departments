import { describe, expect, it } from 'vitest';

import { calculateShiftHours } from './utils';
import type { ShiftEntry } from './types';

function shift(start: string, end: string): ShiftEntry {
  return { type: 'shift', shift: { start, end } };
}

describe('future paid-hours calculation', () => {
  it.todo('counts 08:00–17:00 as 8 paid daytime hours', () => {
    expect(calculateShiftHours(shift('08:00', '17:00'))).toEqual({
      day: 8,
      night: 0,
      total: 8,
    });
  });

  it.todo('counts 15:00–23:00 as 6 daytime and 1 nighttime hour', () => {
    expect(calculateShiftHours(shift('15:00', '23:00'))).toEqual({
      day: 6,
      night: 1,
      total: 7,
    });
  });

  it.todo('counts nighttime only inside the 22:00–06:00 window', () => {
    expect(calculateShiftHours(shift('22:00', '06:00'))).toEqual({
      day: 0,
      night: 7,
      total: 7,
    });
  });

  it.todo('handles a shift that crosses midnight', () => {
    expect(calculateShiftHours(shift('20:00', '04:00'))).toEqual({
      day: 1,
      night: 6,
      total: 7,
    });
  });

  it.todo('deducts a one-hour break from an ordinary shift', () => {
    expect(calculateShiftHours(shift('06:00', '14:00'))).toEqual({
      day: 7,
      night: 0,
      total: 7,
    });
  });
});
