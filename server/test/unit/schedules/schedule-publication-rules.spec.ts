import {
  SCHEDULE_PUBLICATION_RULES_VERSION,
  assertSchedulePublicationRules,
  validateSchedulePublicationSnapshot,
} from '../../../src/schedules/schedule-publication-rules';
import type { SchedulePublicationSnapshot } from '../../../src/schedules/schedule-publications.service';

function snapshot(): SchedulePublicationSnapshot {
  return {
    department: {
      id: 'department-a',
      name: 'Front Office',
      kind: 'FO',
    },
    employees: [
      {
        id: 'employee-1',
        displayName: 'Employee 1',
        employmentRate: 1,
        scheduleMode: 'FIXED_WEEKDAYS',
        fixedStartTime: '08:00',
        fixedEndTime: '17:00',
      },
    ],
    shifts: [
      {
        id: 'shift-1',
        employeeId: 'employee-1',
        date: '2026-09-07',
        code: 'E',
        startTime: '08:00',
        endTime: '17:00',
        isOff: false,
        updatedAt: '2026-09-01T11:00:00.000Z',
      },
    ],
  };
}

describe('schedule publication rules', () => {
  it('accepts a valid publication snapshot', () => {
    expect(validateSchedulePublicationSnapshot(snapshot(), 2026, 9)).toEqual([]);
    expect(() =>
      assertSchedulePublicationRules(snapshot(), 2026, 9),
    ).not.toThrow();
  });

  it('rejects invalid fixed-weekday times and malformed shift cells', () => {
    const value = snapshot();
    value.employees[0].fixedEndTime = '08:00';
    value.shifts[0].endTime = '08:00';

    expect(validateSchedulePublicationSnapshot(value, 2026, 9)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_FIXED_WEEKDAYS_PATTERN',
          employeeId: 'employee-1',
        }),
        expect.objectContaining({
          code: 'ZERO_DURATION_SHIFT',
          shiftId: 'shift-1',
        }),
      ]),
    );
  });

  it('rejects unknown employees, duplicate cells and dates outside the publication month', () => {
    const value = snapshot();
    value.shifts = [
      {
        ...value.shifts[0],
        id: 'shift-1',
        employeeId: 'employee-missing',
        date: '2026-10-01',
      },
      {
        ...value.shifts[0],
        id: 'shift-2',
        employeeId: 'employee-missing',
        date: '2026-10-01',
      },
    ];

    const violations = validateSchedulePublicationSnapshot(value, 2026, 9);

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UNKNOWN_SHIFT_EMPLOYEE' }),
        expect.objectContaining({ code: 'DUPLICATE_SHIFT_CELL' }),
        expect.objectContaining({ code: 'SHIFT_OUTSIDE_PERIOD' }),
      ]),
    );
  });

  it('rejects malformed OFF cells and unsupported shift codes', () => {
    const value = snapshot();
    value.shifts = [
      {
        ...value.shifts[0],
        isOff: true,
        startTime: '08:00',
        endTime: '17:00',
        code: null,
      },
      {
        ...value.shifts[0],
        id: 'shift-2',
        date: '2026-09-08',
        code: 'UNKNOWN',
      },
    ];

    const violations = validateSchedulePublicationSnapshot(value, 2026, 9);

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_OFF_SHIFT' }),
        expect.objectContaining({ code: 'UNSUPPORTED_SHIFT_CODE' }),
      ]),
    );
  });

  it('returns a stable server-owned rules version in validation errors', () => {
    const value = snapshot();
    value.shifts[0].endTime = value.shifts[0].startTime;

    try {
      assertSchedulePublicationRules(value, 2026, 9);
      throw new Error('Expected publication validation to fail');
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          code: 'SCHEDULE_PUBLICATION_RULES_FAILED',
          rulesVersion: SCHEDULE_PUBLICATION_RULES_VERSION,
        }),
      });
    }
  });
});
