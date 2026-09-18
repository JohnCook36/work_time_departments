import { describe, expect, it } from 'vitest';

import { getDayOfWeek, getDaysInMonth, validateShiftInput } from './utils';

describe('validateShiftInput', () => {
  it.each(['', '   ', '\t\n'])('treats %j as an empty entry', (input) => {
    expect(validateShiftInput(input)).toEqual({ type: 'empty' });
  });

  it.each(['OFF', 'off', ' Off '])('recognizes %j as a day off', (input) => {
    expect(validateShiftInput(input)).toEqual({ type: 'off' });
  });

  it.each([
    ['08:00-17:00', '08:00', '17:00'],
    ['8:05 - 16:30', '08:05', '16:30'],
    ['15:00–23:00', '15:00', '23:00'],
    ['22:00—6:00', '22:00', '06:00'],
    ['23:59-00:00', '23:59', '00:00'],
  ])('accepts %s and normalizes its times', (input, start, end) => {
    expect(validateShiftInput(input)).toEqual({
      type: 'shift',
      shift: { start, end },
    });
  });

  it.each(['08:00/17:00', '8-17', '08:0-17:00', 'work'])(
    'rejects the malformed value %j',
    (input) => {
      expect(validateShiftInput(input)).toEqual({
        type: 'error',
        error: 'Формат: ЧЧ:ММ-ЧЧ:ММ (напр. 08:00-16:00)',
      });
    },
  );

  it.each(['24:00-17:00', '08:00-24:00'])(
    'rejects out-of-range hours in %s',
    (input) => {
      expect(validateShiftInput(input)).toEqual({
        type: 'error',
        error: 'Часы не могут быть > 23',
      });
    },
  );

  it.each(['08:60-17:00', '08:00-17:60'])(
    'rejects out-of-range minutes in %s',
    (input) => {
      expect(validateShiftInput(input)).toEqual({
        type: 'error',
        error: 'Минуты не могут быть > 59',
      });
    },
  );
});

describe('getDaysInMonth', () => {
  it.each([
    [2026, 0, 31],
    [2026, 3, 30],
    [2023, 1, 28],
    [2024, 1, 29],
  ])('%i-%i has %i days', (year, month, days) => {
    expect(getDaysInMonth(year, month)).toBe(days);
  });
});

describe('getDayOfWeek', () => {
  it.each([
    [2026, 8, 18, 5],
    [2026, 8, 20, 0],
    [2024, 1, 29, 4],
  ])(
    '%i-%i-%i has weekday index %i',
    (year, month, day, weekday) => {
      expect(getDayOfWeek(year, month, day)).toBe(weekday);
    },
  );
});
