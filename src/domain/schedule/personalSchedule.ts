import type { MyScheduleResponse, MyScheduleShift } from '../../api/auth';
import { ShiftCode, ShiftEntry } from '../models';
import { getDaysInMonth } from '../../utils/calendar';

const SUPPORTED_CODES = new Set<ShiftCode>(['E', 'IN', 'INN', 'L', 'N']);

export function toShiftEntry(shift: MyScheduleShift): ShiftEntry {
  if (shift.isOff) {
    return { type: 'off' };
  }

  if (!shift.startTime || !shift.endTime) {
    return { type: 'empty' };
  }

  const code =
    shift.code && SUPPORTED_CODES.has(shift.code as ShiftCode)
      ? (shift.code as ShiftCode)
      : undefined;

  return {
    type: 'shift',
    shift: {
      start: shift.startTime,
      end: shift.endTime,
      ...(code ? { code } : {}),
    },
  };
}

export function buildVisibleShifts(
  data: MyScheduleResponse,
): Array<MyScheduleShift & { inherited?: boolean }> {
  if (
    data.employee.scheduleMode !== 'FIXED_WEEKDAYS' ||
    !data.employee.fixedStartTime ||
    !data.employee.fixedEndTime
  ) {
    return data.shifts;
  }

  const explicitByDate = new Map(
    data.shifts.map((shift) => [shift.date, shift]),
  );
  const days = getDaysInMonth(data.period.year, data.period.month - 1);
  const visible: Array<MyScheduleShift & { inherited?: boolean }> = [];

  for (let day = 1; day <= days; day++) {
    const date = new Date(
      data.period.year,
      data.period.month - 1,
      day,
    );
    const dateKey =
      data.period.year +
      '-' +
      String(data.period.month).padStart(2, '0') +
      '-' +
      String(day).padStart(2, '0');
    const explicit = explicitByDate.get(dateKey);

    if (explicit) {
      visible.push(explicit);
      continue;
    }

    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    visible.push({
      id: 'default:' + data.employee.id + ':' + dateKey,
      employeeId: data.employee.id,
      date: dateKey,
      code: null,
      startTime: data.employee.fixedStartTime,
      endTime: data.employee.fixedEndTime,
      isOff: false,
      updatedAt: '',
      inherited: true,
    });
  }

  return visible;
}
