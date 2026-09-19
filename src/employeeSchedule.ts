import {
  Employee,
  ScheduleData,
  SchedulePeriodsData,
  ShiftEntry,
} from './types';
import { getDayOfWeek, getDaysInMonth } from './utils';

function getPeriodKey(year: number, month: number): string {
  return year + '-' + String(month + 1).padStart(2, '0');
}

export function getEmployeeDefaultEntry(
  employee: Employee,
  year: number,
  month: number,
  day: number,
): ShiftEntry {
  if (
    employee.scheduleMode !== 'fixed-weekdays' ||
    !employee.fixedStartTime ||
    !employee.fixedEndTime
  ) {
    return { type: 'empty' };
  }

  const dayOfWeek = getDayOfWeek(year, month, day);

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { type: 'off' };
  }

  return {
    type: 'shift',
    shift: {
      start: employee.fixedStartTime,
      end: employee.fixedEndTime,
    },
  };
}

export function buildEffectiveSchedule(
  employees: Employee[],
  schedule: ScheduleData,
  year: number,
  month: number,
): ScheduleData {
  const daysInMonth = getDaysInMonth(year, month);
  const next: ScheduleData = {};

  employees.forEach((employee) => {
    const rawEmployeeSchedule = schedule[employee.id] || {};
    const employeeSchedule: ScheduleData[string] = {};

    for (let day = 1; day <= daysInMonth; day++) {
      employeeSchedule[day] =
        rawEmployeeSchedule[day] ??
        getEmployeeDefaultEntry(employee, year, month, day);
    }

    next[employee.id] = employeeSchedule;
  });

  return next;
}

export function buildEffectiveSchedulePeriods(
  employees: Employee[],
  schedules: SchedulePeriodsData,
  centerYear: number,
  centerMonth: number,
): SchedulePeriodsData {
  const next: SchedulePeriodsData = { ...schedules };

  for (let offset = -1; offset <= 1; offset++) {
    const date = new Date(centerYear, centerMonth + offset, 1);
    const year = date.getFullYear();
    const month = date.getMonth();
    const key = getPeriodKey(year, month);

    next[key] = buildEffectiveSchedule(
      employees,
      schedules[key] || {},
      year,
      month,
    );
  }

  return next;
}
