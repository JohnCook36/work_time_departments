import { BadRequestException } from '@nestjs/common';

import type { SchedulePublicationSnapshot } from './schedule-publications.service';

export const SCHEDULE_PUBLICATION_RULES_VERSION =
  'schedule-publication-rules-v1';

export type SchedulePublicationRuleSeverity = 'hard' | 'soft';

export interface SchedulePublicationRuleViolation {
  severity: SchedulePublicationRuleSeverity;
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
        severity: 'hard',
        code: 'DUPLICATE_EMPLOYEE',
        message: 'Сотрудник встречается в проверяемом графике больше одного раза.',
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
          severity: 'hard',
          code: 'INVALID_FIXED_WEEKDAYS_PATTERN',
          message:
            'Для графика 5/2 должны быть заданы разные время начала и окончания в формате ЧЧ:ММ.',
          employeeId: employee.id,
        });
      }
    }
  }

  const shiftKeys = new Set<string>();
  const employeesWithSavedCells = new Set<string>();
  for (const shift of snapshot.shifts) {
    employeesWithSavedCells.add(shift.employeeId);
    const key = shift.employeeId + ':' + shift.date;
    if (shiftKeys.has(key)) {
      violations.push({
        severity: 'hard',
        code: 'DUPLICATE_SHIFT_CELL',
        message:
          'На одну дату у сотрудника найдено больше одной сохранённой смены.',
        employeeId: shift.employeeId,
        shiftId: shift.id,
        date: shift.date,
      });
    } else {
      shiftKeys.add(key);
    }

    if (!employeeIds.has(shift.employeeId)) {
      violations.push({
        severity: 'hard',
        code: 'UNKNOWN_SHIFT_EMPLOYEE',
        message:
          'Смена относится к сотруднику, которого нет в проверяемом отделе.',
        employeeId: shift.employeeId,
        shiftId: shift.id,
        date: shift.date,
      });
    }

    if (!isSelectedMonthDate(shift.date, year, month)) {
      violations.push({
        severity: 'hard',
        code: 'SHIFT_OUTSIDE_PERIOD',
        message: 'Дата смены находится за пределами выбранного месяца.',
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
          severity: 'hard',
          code: 'INVALID_OFF_SHIFT',
          message: 'OFF не должен содержать время или код смены.',
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
        severity: 'hard',
        code: 'INVALID_SHIFT_TIME',
        message: 'У рабочей смены должны быть начало и окончание в формате ЧЧ:ММ.',
        employeeId: shift.employeeId,
        shiftId: shift.id,
        date: shift.date,
      });
      continue;
    }

    if (shift.startTime === shift.endTime) {
      violations.push({
        severity: 'hard',
        code: 'ZERO_DURATION_SHIFT',
        message: 'Время начала и окончания рабочей смены не может совпадать.',
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
        severity: 'hard',
        code: 'UNSUPPORTED_SHIFT_CODE',
        message: 'У смены указан неподдерживаемый код.',
        employeeId: shift.employeeId,
        shiftId: shift.id,
        date: shift.date,
      });
    }
  }

  for (const employee of snapshot.employees) {
    if (!employeesWithSavedCells.has(employee.id)) {
      violations.push({
        severity: 'soft',
        code: 'NO_SAVED_CELLS_FOR_EMPLOYEE',
        message: 'У сотрудника нет сохранённых смен или OFF на выбранный месяц.',
        employeeId: employee.id,
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
  const hardViolations = violations.filter(
    (violation) => violation.severity === 'hard',
  );
  if (hardViolations.length === 0) return;

  throw new BadRequestException({
    message: 'Schedule failed pre-publication validation',
    code: 'SCHEDULE_PUBLICATION_RULES_FAILED',
    rulesVersion: SCHEDULE_PUBLICATION_RULES_VERSION,
    violations: hardViolations,
  });
}
