import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

const MINUTE_MS = 60_000;

export function businessTimeZone(): string {
  const value = process.env.BUSINESS_TIME_ZONE?.trim();
  if (!value) {
    throw new ServiceUnavailableException('BUSINESS_TIME_ZONE is not configured');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
  } catch {
    throw new ServiceUnavailableException('BUSINESS_TIME_ZONE must be a valid IANA time zone');
  }
  return value;
}

function parts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
      .filter(item => item.type !== 'literal')
      .map(item => [item.type, item.value]),
  );
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    - Math.floor(date.getTime() / 1000) * 1000;
}

export function addDateDays(dateText: string, days: number): string {
  const date = new Date(dateText + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) {
    throw new BadRequestException('date is invalid');
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function localBusinessDateTime(
  dateText: string,
  timeText: string,
  timeZone = businessTimeZone(),
): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeText)) {
    throw new BadRequestException('Business date/time is invalid');
  }
  const date = new Date(dateText + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) {
    throw new BadRequestException('Business date is invalid');
  }
  const [hour, minute] = timeText.split(':').map(Number);
  const wall = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute);
  let resolved = new Date(wall);
  for (let index = 0; index < 3; index += 1) {
    resolved = new Date(wall - offsetMs(resolved, timeZone));
  }
  const p = parts(resolved, timeZone);
  if (p.year !== date.getUTCFullYear() || p.month !== date.getUTCMonth() + 1 ||
      p.day !== date.getUTCDate() || p.hour !== hour || p.minute !== minute) {
    throw new BadRequestException('Business date/time does not exist in configured time zone');
  }
  return resolved;
}

export function publishedShiftInterval(
  dateText: string,
  startTime: string,
  endTime: string,
  timeZone = businessTimeZone(),
) {
  const startAt = localBusinessDateTime(dateText, startTime, timeZone);
  const endDate = endTime <= startTime ? addDateDays(dateText, 1) : dateText;
  const endAt = localBusinessDateTime(endDate, endTime, timeZone);
  if (endAt <= startAt) throw new BadRequestException('Published shift interval is invalid');
  return { startAt, endAt };
}

export function intervalMinutes(startAt: Date, endAt: Date): number {
  if (endAt <= startAt) throw new BadRequestException('Interval end must follow start');
  return Math.round((endAt.getTime() - startAt.getTime()) / MINUTE_MS);
}


export interface BusinessIntervalMinutes {
  dayMinutes: number;
  nightMinutes: number;
  totalMinutes: number;
}

export function businessDateText(
  date = new Date(),
  timeZone = businessTimeZone(),
): string {
  const value = parts(date, timeZone);
  return (
    String(value.year).padStart(4, '0') +
    '-' +
    String(value.month).padStart(2, '0') +
    '-' +
    String(value.day).padStart(2, '0')
  );
}

function localDateText(date: Date, timeZone: string): string {
  const value = parts(date, timeZone);
  return (
    String(value.year).padStart(4, '0') +
    '-' +
    String(value.month).padStart(2, '0') +
    '-' +
    String(value.day).padStart(2, '0')
  );
}

function overlapMinutes(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): number {
  return Math.max(
    0,
    Math.min(endA.getTime(), endB.getTime()) -
      Math.max(startA.getTime(), startB.getTime()),
  ) / MINUTE_MS;
}

export function splitBusinessInterval(
  startAt: Date,
  endAt: Date,
  timeZone = businessTimeZone(),
): BusinessIntervalMinutes {
  if (endAt <= startAt) {
    throw new BadRequestException('Interval end must follow start');
  }

  let dayMinutes = 0;
  let nightMinutes = 0;
  let dateText = localDateText(startAt, timeZone);
  const finalDate = localDateText(new Date(endAt.getTime() - 1), timeZone);

  while (dateText <= finalDate) {
    const dayStart = localBusinessDateTime(dateText, '00:00', timeZone);
    const day06 = localBusinessDateTime(dateText, '06:00', timeZone);
    const day22 = localBusinessDateTime(dateText, '22:00', timeZone);
    const nextStart = localBusinessDateTime(addDateDays(dateText, 1), '00:00', timeZone);

    nightMinutes += overlapMinutes(startAt, endAt, dayStart, day06);
    dayMinutes += overlapMinutes(startAt, endAt, day06, day22);
    nightMinutes += overlapMinutes(startAt, endAt, day22, nextStart);

    dateText = addDateDays(dateText, 1);
  }

  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    dayMinutes: round(dayMinutes),
    nightMinutes: round(nightMinutes),
    totalMinutes: round(dayMinutes + nightMinutes),
  };
}
