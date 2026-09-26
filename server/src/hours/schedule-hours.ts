import { getRussiaFiveDayNormHours } from '../calendar/productionCalendar';

const MINUTES_IN_DAY = 24 * 60;
const NIGHT_START = 22 * 60;
const NIGHT_END = 6 * 60;
const DEFAULT_BREAK_MINUTES = 60;
const FIXED_NIGHT_SHIFT_MINUTES = 12 * 60;
const MAX_NIGHT_WINDOW_MINUTES = 8 * 60;

export interface PlannedShiftHours {
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
  endB: number,
): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function calculateNightMinutes(start: number, end: number): number {
  let total = 0;
  for (let dayOffset = -1; dayOffset <= 2; dayOffset++) {
    const dayStart = dayOffset * MINUTES_IN_DAY;
    total += overlapMinutes(start, end, dayStart, dayStart + NIGHT_END);
    total += overlapMinutes(
      start,
      end,
      dayStart + NIGHT_START,
      dayStart + MINUTES_IN_DAY,
    );
  }
  return total;
}

function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function calculatePlannedShiftHours(
  startTime: string,
  endTime: string,
  code?: string | null,
): PlannedShiftHours {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end <= start) end += MINUTES_IN_DAY;

  const rawTotalMinutes = end - start;
  const rawNightMinutes = calculateNightMinutes(start, end);

  if (code === 'N') {
    const nightMinutes = Math.min(
      rawNightMinutes,
      MAX_NIGHT_WINDOW_MINUTES,
      FIXED_NIGHT_SHIFT_MINUTES,
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
    rawTotalMinutes - DEFAULT_BREAK_MINUTES,
  );
  const dayBreakMinutes = Math.min(DEFAULT_BREAK_MINUTES, rawDayMinutes);
  const remainingBreakMinutes = DEFAULT_BREAK_MINUTES - dayBreakMinutes;
  const paidDayMinutes = Math.max(0, rawDayMinutes - dayBreakMinutes);
  const paidNightMinutes = Math.max(
    0,
    rawNightMinutes - remainingBreakMinutes,
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

export function getMonthlyProductionNormHours(
  year: number,
  month: number,
  employmentRate = 1,
): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let hours = 0;

  for (let day = 1; day <= days; day++) {
    hours += getRussiaFiveDayNormHours(year, month - 1, day, 8);
  }

  return Math.round(hours * employmentRate * 100) / 100;
}
