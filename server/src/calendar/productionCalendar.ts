/**
 * Russian production calendar helpers for a standard five-day work week.
 *
 * Month is zero-based to match JavaScript Date and the rest of the planner domain.
 * Year-specific overrides are intentionally explicit: transferred weekends are
 * established separately for each calendar year and must not be guessed.
 */

const FIXED_NON_WORKING_HOLIDAYS = new Set([
  '01-01',
  '01-02',
  '01-03',
  '01-04',
  '01-05',
  '01-06',
  '01-07',
  '01-08',
  '02-23',
  '03-08',
  '05-01',
  '05-09',
  '06-12',
  '11-04',
]);

interface ProductionCalendarOverrides {
  nonWorking: ReadonlySet<string>;
  shortened: ReadonlySet<string>;
  working: ReadonlySet<string>;
}

const EMPTY_OVERRIDES: ProductionCalendarOverrides = {
  nonWorking: new Set(),
  shortened: new Set(),
  working: new Set(),
};

const YEAR_OVERRIDES: Record<number, ProductionCalendarOverrides> = {
  2026: {
    // Official five-day production calendar:
    // Jan 9 and Dec 31 are transferred weekends; Mar 9 and May 11 are
    // compensating days off for holidays falling on weekends.
    nonWorking: new Set(['01-09', '03-09', '05-11', '12-31']),
    shortened: new Set(['04-30', '05-08', '06-11', '11-03']),
    working: new Set(),
  },
};

function dateKey(month: number, day: number): string {
  return (
    String(month + 1).padStart(2, '0') +
    '-' +
    String(day).padStart(2, '0')
  );
}

function overridesFor(year: number): ProductionCalendarOverrides {
  return YEAR_OVERRIDES[year] ?? EMPTY_OVERRIDES;
}

export function isRussiaFiveDayWorkingDay(
  year: number,
  month: number,
  day: number,
): boolean {
  const key = dateKey(month, day);
  const overrides = overridesFor(year);

  if (overrides.working.has(key)) return true;
  if (overrides.nonWorking.has(key)) return false;
  if (FIXED_NON_WORKING_HOLIDAYS.has(key)) return false;

  const dayOfWeek = new Date(year, month, day).getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

export function isRussiaFiveDayShortenedDay(
  year: number,
  month: number,
  day: number,
): boolean {
  return (
    isRussiaFiveDayWorkingDay(year, month, day) &&
    overridesFor(year).shortened.has(dateKey(month, day))
  );
}

export function getRussiaFiveDayNormHours(
  year: number,
  month: number,
  day: number,
  dailyHours = 8,
): number {
  if (!isRussiaFiveDayWorkingDay(year, month, day)) return 0;

  return Math.max(
    0,
    dailyHours - (isRussiaFiveDayShortenedDay(year, month, day) ? 1 : 0),
  );
}
