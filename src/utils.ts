import { ShiftEntry } from './types';

// Day hours: 06:00 - 22:00
// Night hours: 22:00 - 06:00

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function calculateShiftHours(entry: ShiftEntry): { day: number; night: number; total: number } {
  if (entry.type !== 'shift' || !entry.shift) {
    return { day: 0, night: 0, total: 0 };
  }

  const startMin = timeToMinutes(entry.shift.start);
  let endMin = timeToMinutes(entry.shift.end);

  // Handle overnight shifts (end < start means it crosses midnight)
  if (endMin <= startMin) {
    endMin += 24 * 60;
  }

  const DAY_START = 6 * 60;  // 06:00
  const DAY_END = 22 * 60;   // 22:00

  let dayMinutes = 0;
  let nightMinutes = 0;

  // Calculate overlap with day period [06:00, 22:00)
  const dayOverlapStart = Math.max(startMin, DAY_START);
  const dayOverlapEnd = Math.min(endMin, DAY_END);
  if (dayOverlapEnd > dayOverlapStart) {
    dayMinutes += dayOverlapEnd - dayOverlapStart;
  }

  // Night = total - day
  const totalMinutes = endMin - startMin;
  nightMinutes = totalMinutes - dayMinutes;

  const day = Math.round(dayMinutes / 60 * 100) / 100;
  const night = Math.round(nightMinutes / 60 * 100) / 100;
  const total = Math.round(totalMinutes / 60 * 100) / 100;

  return { day, night, total };
}

export function validateShiftInput(input: string): ShiftEntry {
  const trimmed = input.trim();

  if (trimmed === '') {
    return { type: 'empty' };
  }

  if (trimmed.toUpperCase() === 'OFF') {
    return { type: 'off' };
  }

  // Match format: HH:MM-HH:MM or H:MM-H:MM
  const shiftPattern = /^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/;
  const match = trimmed.match(shiftPattern);

  if (!match) {
    return {
      type: 'error',
      error: 'Формат: ЧЧ:ММ-ЧЧ:ММ (напр. 08:00-16:00)'
    };
  }

  const [, startH, startM, endH, endM] = match;
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

  return {
    type: 'shift',
    shift: { start: startStr, end: endStr }
  };
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month, day).getDay();
}

export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

export const DAY_NAMES_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
