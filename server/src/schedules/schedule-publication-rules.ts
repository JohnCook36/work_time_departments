import { BadRequestException } from '@nestjs/common';

import type { SchedulePublicationSnapshot } from './schedule-publications.service';

export const SCHEDULE_PUBLICATION_RULES_VERSION =
  'schedule-publication-rules-v1';

export interface SchedulePublicationRuleViolation {
  code: string;
  message: string;
  employeeId?: string;
  shiftId?: string;
  date?: string;
}

const SHIFT_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ALLOWED_SHIFT_CODES = new Set(['E', 'IN', 'INN', 'L', 'N']);

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isSelectedMonthDate(
  value: string,
  year: number,
  month: number,
): boolean {
  const prefix = String(year) + '-' + String(month).padStart(2, '0') + '-';
  if (!value.startsWith(prefix) || value.length !== 10) return false;

  const day = Number(value.slice(8, 10));
  return (
    Number.isInteger(day) &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    value === prefix + String(day).padStart(2, '0')
  );
}

export function validateSchedulePublicationSnapshot(
  snapshot: SchedulePublicationSnapshot,
  year: number,
  month: number,
): SchedulePublicationRuleViolation[] {
  const violations: SchedulePublicationRuleViolation[] = [];
  const employeeIds = new Set<string>();

  for (const employee of snapshot.employees) {
    if (employeeIds.has(employee.id)) {
      violations.push({
        code: 'DUPLICATE_EMPLOYEE',
        message: 'Employee appears more than once in the publication snapshot.',
        employeeId: employee.id,
      });
      continue;
    }
    employeeIds.add(employee.id);

    if (employee.scheduleMode === 'FIXED_WEEKDAYS') {
      const validStart =
        typeof employee.fixedStartTime === 'string' &&
        SHIFT_TIME_PATTERN.test(employee.fixedStartTime);
      const validEnd =
        typeof employee.fixedEndTime === 'string' &&
        SHIFT_TIME_PATTERN.test(employee.fixedEndTime);

      if (
        !validStart ||
        !validEnd ||
        employee.fixedStartTime === employee.fixedEndTime
      ) {
        violations.push({
          code: 'INVALID_FIXED_WEEKDAYS_PATTERN',
          message:
            'Fixed-weekday employee must have distinct fixed start/end times in HH:MM format.',
          employeeId: employee.id,
        });
      }
    }
  }

  const shiftKeys = new Set<string>();
  for (const shift of snapshot.shifts) {
    const key = shift.employeeId + ':' + shift.date;
    if (shiftKeys.has(key)) {
      violations.push({
        code: 'DUPLICATE_SHIFT_CELL',
        message:
          'Publication snapshot contains more than one shift for the same employee and date.',
        employeeId: shift.employeeId,
        shiftId: shift.id,
        date: shift.date,
      });
    } else {
      shiftKeys.add(key);
    }

    if (!employeeIds.has(shift.employeeId)) {
      violations.push({
        code: 'UNKNOWN_SHIFT_EMPLOYEE',
        message:
          'Shift belongs to an employee that is not present in the publication snapshot.',
        employeeId: shift.employeeId,
        shiftId: shift.id,
        date: shift.date,
      });
    }

    if (!isSelectedMonthDate(shift.date, year, month)) {
      violations.push({
        code: 'SHIFT_OUTSIDE_PERIOD',
        message: 'Shift date is outside the publication month.',
        employeeId: shift.employeeId,
        shiftId: shift.id,
        date: shift.date,
      });
    }

    if (shift.isOff) {
      if (
        shift.startTime !== null ||
        shift.endTime !== null ||
        shift.code !== null
      ) {
        violations.push({
          code: 'INVALID_OFF_SHIFT',
          message: 'OFF shift must not contain time or shift code.',
          employeeId: shift.employeeId,
          shiftId: shift.id,
          date: shift.date,
        });
      }
      continue;
    }

    if (
      typeof shift.startTime !== 'string' ||
      !SHIFT_TIME_PATTERN.test(shift.startTime) ||
      typeof shift.endTime !== 'string' ||
      !SHIFT_TIME_PATTERN.test(shift.endTime)
    ) {
      violations.push({
        code: 'INVALID_SHIFT_TIME',
        message: 'Working shift must contain start/end times in HH:MM format.',
        employeeId: shift.employeeId,
        shiftId: shift.id,
        date: shift.date,
      });
      continue;
    }

    if (shift.startTime === shift.endTime) {
      violations.push({
        code: 'ZERO_DURATION_SHIFT',
        message: 'Working shift start and end times must be different.',
        employeeId: shift.employeeId,
        shiftId: shift.id,
        date: shift.date,
      });
    }

    if (
      shift.code !== null &&
      !ALLOWED_SHIFT_CODES.has(shift.code.toUpperCase())
    ) {
      violations.push({
        code: 'UNSUPPORTED_SHIFT_CODE',
        message: 'Working shift contains an unsupported shift code.',
        employeeId: shift.employeeId,
        shiftId: shift.id,
        date: shift.date,
      });
    }
  }

  return violations;
}

export function assertSchedulePublicationRules(
  snapshot: SchedulePublicationSnapshot,
  year: number,
  month: number,
): void {
  const violations = validateSchedulePublicationSnapshot(
    snapshot,
    year,
    month,
  );
  if (violations.length === 0) return;

  throw new BadRequestException({
    message: 'Schedule failed pre-publication validation',
    code: 'SCHEDULE_PUBLICATION_RULES_FAILED',
    rulesVersion: SCHEDULE_PUBLICATION_RULES_VERSION,
    violations,
  });
}
