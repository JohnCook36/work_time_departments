import { Employee, ShiftEntry } from './types';

// Day hours: 06:00 - 22:00
// Night hours: 22:00 - 06:00

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

export function calculateShiftHours(
  entry: ShiftEntry,
  employee?: Pick<Employee, 'breakMinutes'>
): { day: number; night: number; total: number } {
  if (entry.type !== 'shift' || !entry.shift) {
    return { day: 0, night: 0, total: 0 };
  }

  const startMin = timeToMinutes(entry.shift.start);
  let endMin = timeToMinutes(entry.shift.end);
  if (endMin <= startMin) endMin += 24 * 60;

  const rawMinutes = endMin - startMin;

  // Day windows 06:00–22:00 for current and next calendar day.
  const dayMinutes =
    overlap(startMin, endMin, 6 * 60, 22 * 60) +
    overlap(startMin, endMin, 30 * 60, 46 * 60);
  const nightMinutes = Math.max(0, rawMinutes - dayMinutes);

  // Existing business rule: N is always paid as 12 hours.
  const paidMinutes =
    entry.shift.code?.toUpperCase() === 'N'
      ? 12 * 60
      : Math.max(0, rawMinutes - (employee?.breakMinutes ?? 60));

  // Preserve actual night overlap first; break reduces the day portion.
  const paidNight = Math.min(nightMinutes, paidMinutes);
  const paidDay = Math.max(0, paidMinutes - paidNight);

  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    day: round(paidDay / 60),
    night: round(paidNight / 60),
    total: round(paidMinutes / 60),
  };
}

export function validateShiftInput(input: string): ShiftEntry {
  const trimmed = input.trim();
  if (trimmed === '') return { type: 'empty' };

  const upper = trimmed.toUpperCase();
  if (upper === 'OFF') return { type: 'off' };
  if (upper === 'VAC') return { type: 'vac' };
  if (upper === 'SICK') return { type: 'sick' };

  // Optional familiar shift code + interval.
  const shiftPattern = /^(?:(E|INN?|L|N)\s+)?(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/i;
  const match = trimmed.match(shiftPattern);

  if (!match) {
    return {
      type: 'error',
      error: 'Формат: 08:00-17:00, N 20:30-07:30, OFF, VAC или SICK',
    };
  }

  const [, codeRaw, startH, startM, endH, endM] = match;
  const sh = Number(startH);
  const sm = Number(startM);
  const eh = Number(endH);
  const em = Number(endM);

  if (sh > 23 || eh > 23) return { type: 'error', error: 'Часы не могут быть > 23' };
  if (sm > 59 || em > 59) return { type: 'error', error: 'Минуты не могут быть > 59' };

  return {
    type: 'shift',
    shift: {
      start: `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`,
      end: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`,
      code: codeRaw?.toUpperCase(),
    },
  };
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month, day).getDay();
}

export function makeDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

export const DAY_NAMES_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
