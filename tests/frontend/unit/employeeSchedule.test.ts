import { describe, expect, it } from 'vitest';

import {
  buildEffectiveSchedule,
  getEmployeeDefaultEntry,
} from '../../../src/domain/schedule/employeeSchedule';
import { Employee, ScheduleData } from '../../../src/domain/models';

const flexibleEmployee: Employee = {
  id: 'employee-flex',
  name: 'Employee',
  departmentId: 'department-a',
  scheduleMode: 'flexible',
};

const fixedEmployee: Employee = {
  id: 'employee-fixed',
  name: 'Employee',
  departmentId: 'department-a',
  scheduleMode: 'fixed-weekdays',
  fixedStartTime: '08:00',
  fixedEndTime: '17:00',
};

describe('getEmployeeDefaultEntry', () => {
  it('does not synthesize shifts for floating schedules', () => {
    expect(
      getEmployeeDefaultEntry(flexibleEmployee, 2026, 8, 7),
    ).toEqual({ type: 'empty' });
  });

  it('synthesizes fixed hours on weekdays', () => {
    expect(
      getEmployeeDefaultEntry(fixedEmployee, 2026, 8, 7),
    ).toEqual({
      type: 'shift',
      shift: {
        start: '08:00',
        end: '17:00',
      },
    });
  });

  it('uses OFF on weekends for fixed 5/2 schedule', () => {
    expect(
      getEmployeeDefaultEntry(fixedEmployee, 2026, 8, 6),
    ).toEqual({ type: 'off' });
  });

  it('uses OFF on official non-working holidays for fixed 5/2 schedule', () => {
    expect(
      getEmployeeDefaultEntry(fixedEmployee, 2026, 0, 9),
    ).toEqual({ type: 'off' });
    expect(
      getEmployeeDefaultEntry(fixedEmployee, 2026, 1, 23),
    ).toEqual({ type: 'off' });
    expect(
      getEmployeeDefaultEntry(fixedEmployee, 2026, 2, 9),
    ).toEqual({ type: 'off' });
  });
});

describe('buildEffectiveSchedule', () => {
  it('keeps an explicit shift override over the fixed template', () => {
    const raw: ScheduleData = {
      'employee-fixed': {
        7: {
          type: 'shift',
          shift: {
            start: '12:00',
            end: '21:00',
          },
        },
      },
    };

    const result = buildEffectiveSchedule(
      [fixedEmployee],
      raw,
      2026,
      8,
    );

    expect(result['employee-fixed'][7]).toEqual(raw['employee-fixed'][7]);
    expect(result['employee-fixed'][8]).toEqual({
      type: 'shift',
      shift: {
        start: '08:00',
        end: '17:00',
      },
    });
  });

  it('keeps an explicit shift override on a production-calendar day off', () => {
    const raw: ScheduleData = {
      'employee-fixed': {
        9: {
          type: 'shift',
          shift: {
            start: '08:00',
            end: '17:00',
          },
        },
      },
    };

    const result = buildEffectiveSchedule(
      [fixedEmployee],
      raw,
      2026,
      0,
    );

    expect(result['employee-fixed'][9]).toEqual(raw['employee-fixed'][9]);
  });

  it('keeps explicit OFF as an exception on a weekday', () => {
    const raw: ScheduleData = {
      'employee-fixed': {
        7: { type: 'off' },
      },
    };

    const result = buildEffectiveSchedule(
      [fixedEmployee],
      raw,
      2026,
      8,
    );

    expect(result['employee-fixed'][7]).toEqual({ type: 'off' });
  });
});
