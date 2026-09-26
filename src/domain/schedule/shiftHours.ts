import { calculatePlannedShiftHours } from '../../../server/src/hours/schedule-hours';
import { getRussiaFiveDayNormHours } from './productionCalendar';
import { EmploymentRate, ShiftCode, ShiftEntry } from '../models';

export interface ShiftHours {
  day: number;
  night: number;
  total: number;
}

export function calculateShiftHours(entry: ShiftEntry): ShiftHours {
  if (entry.type !== 'shift' || !entry.shift) {
    return { day: 0, night: 0, total: 0 };
  }

  return calculatePlannedShiftHours(
    entry.shift.start,
    entry.shift.end,
    entry.shift.code,
  );
}

export function validateShiftInput(input: string): ShiftEntry {
  const trimmed = input.trim();

  if (trimmed === '') {
    return { type: 'empty' };
  }

  if (trimmed.toUpperCase() === 'OFF') {
    return { type: 'off' };
  }

  // Supported formats:
  // 08:00-17:00
  // N 20:00-08:00
  // E 07:00-16:00
  const shiftPattern =
    /^(?:(E|IN|INN|L|N)\s+)?(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/i;
  const match = trimmed.match(shiftPattern);

  if (!match) {
    return {
      type: 'error',
      error:
        'Формат: ЧЧ:ММ-ЧЧ:ММ или КОД ЧЧ:ММ-ЧЧ:ММ (напр. N 20:00-08:00)',
    };
  }

  const [, rawCode, startH, startM, endH, endM] = match;
  const sh = parseInt(startH);
  const sm = parseInt(startM);
  const eh = parseInt(endH);
  const em = parseInt(endM);

  if (sh > 23 || eh > 23) {
    return { type: 'error', error: 'Часы не могут быть > 23' };
  }
  if (sm > 59 || em > 59) {
    return { type: 'error', error: 'Минуты не могут быть > 59' };
  }

  const startStr = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
  const endStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

  if (startStr === endStr) {
    return {
      type: 'error',
      error: 'Время начала и окончания смены не может совпадать',
    };
  }

  const code = rawCode?.toUpperCase() as ShiftCode | undefined;

  return {
    type: 'shift',
    shift: {
      start: startStr,
      end: endStr,
      ...(code ? { code } : {}),
    },
  };
}

export function getWeeklyNormHours(
  year: number,
  month: number,
  startDay: number,
  endDay: number,
  rate: EmploymentRate
): number {
  let normHours = 0;

  for (let day = startDay; day <= endDay; day++) {
    normHours += getRussiaFiveDayNormHours(year, month, day, 8);
  }

  return Math.round(normHours * rate * 100) / 100;
}
