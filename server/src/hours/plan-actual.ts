import { businessTimeZone, intervalMinutes, splitBusinessInterval } from './business-time';

export type PlanActualStatus = 'NO_MARK' | 'IN_PROGRESS' | 'COMPLETED';

export interface PlanActualResult {
  status: PlanActualStatus;
  plannedStartAt: string;
  plannedEndAt: string;
  actualCheckInAt: string | null;
  actualCheckOutAt: string | null;
  plannedMinutes: number;
  plannedDayMinutes: number;
  plannedNightMinutes: number;
  actualMinutes: number | null;
  actualDayMinutes: number | null;
  actualNightMinutes: number | null;
  deltaMinutes: number | null;
  latenessMinutes: number;
  earlyLeaveMinutes: number | null;
  overtimeMinutes: number | null;
  undertimeMinutes: number | null;
  payableAvailable: false;
}

export function comparePlanActual(
  plannedStartAt: Date,
  plannedEndAt: Date,
  actual: { checkInAt: Date; checkOutAt: Date | null } | null,
  _timeZone = businessTimeZone(),
): PlanActualResult {
  const plannedBreakdown = splitBusinessInterval(plannedStartAt, plannedEndAt, _timeZone);
  const plannedMinutes = intervalMinutes(plannedStartAt, plannedEndAt);

  if (!actual) {
    return {
      status: 'NO_MARK',
      plannedStartAt: plannedStartAt.toISOString(),
      plannedEndAt: plannedEndAt.toISOString(),
      actualCheckInAt: null,
      actualCheckOutAt: null,
      plannedMinutes,
      plannedDayMinutes: plannedBreakdown.dayMinutes,
      plannedNightMinutes: plannedBreakdown.nightMinutes,
      actualMinutes: null,
      actualDayMinutes: null,
      actualNightMinutes: null,
      deltaMinutes: null,
      latenessMinutes: 0,
      earlyLeaveMinutes: null,
      overtimeMinutes: null,
      undertimeMinutes: null,
      payableAvailable: false,
    };
  }

  const latenessMinutes = Math.max(
    0,
    Math.round((actual.checkInAt.getTime() - plannedStartAt.getTime()) / 60_000),
  );

  if (!actual.checkOutAt) {
    return {
      status: 'IN_PROGRESS',
      plannedStartAt: plannedStartAt.toISOString(),
      plannedEndAt: plannedEndAt.toISOString(),
      actualCheckInAt: actual.checkInAt.toISOString(),
      actualCheckOutAt: null,
      plannedMinutes,
      plannedDayMinutes: plannedBreakdown.dayMinutes,
      plannedNightMinutes: plannedBreakdown.nightMinutes,
      actualMinutes: null,
      actualDayMinutes: null,
      actualNightMinutes: null,
      deltaMinutes: null,
      latenessMinutes,
      earlyLeaveMinutes: null,
      overtimeMinutes: null,
      undertimeMinutes: null,
      payableAvailable: false,
    };
  }

  const actualBreakdown = splitBusinessInterval(actual.checkInAt, actual.checkOutAt, _timeZone);
  const actualMinutes = intervalMinutes(actual.checkInAt, actual.checkOutAt);
  const deltaMinutes = actualMinutes - plannedMinutes;
  return {
    status: 'COMPLETED',
    plannedStartAt: plannedStartAt.toISOString(),
    plannedEndAt: plannedEndAt.toISOString(),
    actualCheckInAt: actual.checkInAt.toISOString(),
    actualCheckOutAt: actual.checkOutAt.toISOString(),
    plannedMinutes,
    plannedDayMinutes: plannedBreakdown.dayMinutes,
    plannedNightMinutes: plannedBreakdown.nightMinutes,
    actualMinutes,
    actualDayMinutes: actualBreakdown.dayMinutes,
    actualNightMinutes: actualBreakdown.nightMinutes,
    deltaMinutes,
    latenessMinutes,
    earlyLeaveMinutes: Math.max(
      0,
      Math.round((plannedEndAt.getTime() - actual.checkOutAt.getTime()) / 60_000),
    ),
    overtimeMinutes: Math.max(
      0,
      Math.round((actual.checkOutAt.getTime() - plannedEndAt.getTime()) / 60_000),
    ),
    undertimeMinutes: Math.max(0, -deltaMinutes),
    payableAvailable: false,
  };
}
