import { getDayOfWeek } from '../../utils/calendar';
import { EmploymentRate, ShiftCode, ShiftEntry } from '../models';

const MINUTES_IN_DAY = 24 * 60;
const NIGHT_START = 22 * 60;
const NIGHT_END = 6 * 60;
const DEFAULT_BREAK_MINUTES = 60;
const FIXED_NIGHT_SHIFT_MINUTES = 12 * 60;
const MAX_NIGHT_WINDOW_MINUTES = 8 * 60;

export interface ShiftHours {
  day: number;
  night: number;
  total: number;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function overlapMinutes(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function getShiftBounds(entry: ShiftEntry): { start: number; end: number } | null {
  if (entry.type !== 'shift' || !entry.shift) return null;

  const start = timeToMinutes(entry.shift.start);
  let end = timeToMinutes(entry.shift.end);

  if (end <= start) {
    end += MINUTES_IN_DAY;
  }

  return { start, end };
}

function calculateNightMinutes(start: number, end: number): number {
  let total = 0;

  // The input interval is at most one day long plus an overnight wrap.
  // Iterating neighbouring calendar windows keeps the rule correct across midnight.
  for (let dayOffset = -1; dayOffset <= 2; dayOffset++) {
    const dayStart = dayOffset * MINUTES_IN_DAY;

    total += overlapMinutes(
      start,
      end,
      dayStart,
      dayStart + NIGHT_END
    );

    total += overlapMinutes(
      start,
      end,
      dayStart + NIGHT_START,
      dayStart + MINUTES_IN_DAY
    );
  }

  return total;
}

function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function calculateShiftHours(entry: ShiftEntry): ShiftHours {
  const bounds = getShiftBounds(entry);
  if (!bounds || !entry.shift) {
    return { day: 0, night: 0, total: 0 };
  }

  const rawTotalMinutes = bounds.end - bounds.start;
  const rawNightMinutes = calculateNightMinutes(bounds.start, bounds.end);

  if (entry.shift.code === 'N') {
    const nightMinutes = Math.min(
      rawNightMinutes,
      MAX_NIGHT_WINDOW_MINUTES,
      FIXED_NIGHT_SHIFT_MINUTES
    );
    const dayMinutes = FIXED_NIGHT_SHIFT_MINUTES - nightMinutes;

    return {
      day: roundHours(dayMinutes),
      night: roundHours(nightMinutes),
      total: roundHours(FIXED_NIGHT_SHIFT_MINUTES),
    };
  }

  const rawDayMinutes = Math.max(0, rawTotalMinutes - rawNightMinutes);
  const paidTotalMinutes = Math.max(
    0,
    rawTotalMinutes - DEFAULT_BREAK_MINUTES
  );

  // Break is deducted from daytime first. This matches the agreed examples:
  // 15:00-23:00 => 6 day + 1 night paid hour.
  const dayBreakMinutes = Math.min(DEFAULT_BREAK_MINUTES, rawDayMinutes);
  const remainingBreakMinutes = DEFAULT_BREAK_MINUTES - dayBreakMinutes;

  const paidDayMinutes = Math.max(0, rawDayMinutes - dayBreakMinutes);
  const paidNightMinutes = Math.max(
    0,
    rawNightMinutes - remainingBreakMinutes
  );

  const normalizedTotal =
    paidDayMinutes + paidNightMinutes === paidTotalMinutes
      ? paidTotalMinutes
      : paidDayMinutes + paidNightMinutes;

  return {
    day: roundHours(paidDayMinutes),
    night: roundHours(paidNightMinutes),
    total: roundHours(normalizedTotal),
  };
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
  let weekdays = 0;

  for (let day = startDay; day <= endDay; day++) {
    const dayOfWeek = getDayOfWeek(year, month, day);
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      weekdays++;
    }
  }

  return Math.round(weekdays * 8 * rate * 100) / 100;
}
