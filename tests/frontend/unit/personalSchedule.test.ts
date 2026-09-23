import { describe, expect, it } from 'vitest';

import type { MyScheduleResponse } from '../../../src/api/auth';
import {
  buildVisibleShifts,
  toShiftEntry,
} from '../../../src/domain/schedule/personalSchedule';

function fixedScheduleResponse(
  year: number,
  month: number,
): MyScheduleResponse {
  return {
    period: { year, month },
    schedule: null,
    employee: {
      id: 'employee-fixed',
      displayName: 'Иван Иванов',
      employmentRate: 1,
      scheduleMode: 'FIXED_WEEKDAYS',
      fixedStartTime: '08:00',
      fixedEndTime: '17:00',
      department: {
        id: 'department-fo',
        name: 'Front Office',
        kind: 'FO',
      },
    },
    shifts: [],
  };
}

describe('buildVisibleShifts', () => {
  it('does not synthesize fixed 5/2 shifts during 2026 New Year holidays', () => {
    const visible = buildVisibleShifts(fixedScheduleResponse(2026, 1));

    expect(visible.some((shift) => shift.date === '2026-01-09')).toBe(false);
    expect(visible.some((shift) => shift.date === '2026-01-10')).toBe(false);
    expect(visible.some((shift) => shift.date === '2026-01-11')).toBe(false);
    expect(visible.some((shift) => shift.date === '2026-01-12')).toBe(true);
  });

  it('does not synthesize fixed 5/2 shifts for 23 February and 8/9 March 2026', () => {
    const february = buildVisibleShifts(fixedScheduleResponse(2026, 2));
    const march = buildVisibleShifts(fixedScheduleResponse(2026, 3));

    expect(february.some((shift) => shift.date === '2026-02-23')).toBe(false);
    expect(march.some((shift) => shift.date === '2026-03-08')).toBe(false);
    expect(march.some((shift) => shift.date === '2026-03-09')).toBe(false);
    expect(march.some((shift) => shift.date === '2026-03-10')).toBe(true);
  });

  it('keeps an explicit manager shift on a production-calendar day off', () => {
    const data = fixedScheduleResponse(2026, 2);
    data.shifts = [
      {
        id: 'shift-holiday',
        employeeId: data.employee.id,
        date: '2026-02-23',
        code: 'N',
        startTime: '20:00',
        endTime: '08:00',
        isOff: false,
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    ];

    const visible = buildVisibleShifts(data);
    const holidayShift = visible.find(
      (shift) => shift.date === '2026-02-23',
    );

    expect(holidayShift).toEqual(data.shifts[0]);
    expect(toShiftEntry(holidayShift!)).toEqual({
      type: 'shift',
      shift: {
        start: '20:00',
        end: '08:00',
        code: 'N',
      },
    });
  });
});
