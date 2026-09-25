import { AbsenceType } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';

import { validateShiftAbsenceConflicts } from '../../../src/absences/absence-rule';

const snapshot = {
  department: { id: 'department-a', name: 'FO', kind: 'FO' },
  employees: [
    {
      id: 'employee-1',
      displayName: 'Employee',
      employmentRate: 1,
      scheduleMode: 'FLEXIBLE',
      fixedStartTime: null,
      fixedEndTime: null,
    },
  ],
  shifts: [
    {
      id: 'shift-1',
      employeeId: 'employee-1',
      date: '2026-09-20',
      code: null,
      startTime: '08:00',
      endTime: '17:00',
      isOff: false,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'shift-off',
      employeeId: 'employee-1',
      date: '2026-09-21',
      code: null,
      startTime: null,
      endTime: null,
      isOff: true,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ],
};

describe('absence publication rule', () => {
  it('blocks a working shift inside an active absence range', () => {
    expect(
      validateShiftAbsenceConflicts(snapshot, [
        {
          id: 'absence-1',
          employeeId: 'employee-1',
          type: AbsenceType.VACATION,
          startDate: new Date('2026-09-19T00:00:00.000Z'),
          endDate: new Date('2026-09-22T00:00:00.000Z'),
        },
      ]),
    ).toEqual([
      {
        severity: 'hard',
        code: 'SHIFT_OVERLAPS_ABSENCE',
        message:
          'Рабочая смена пересекается с активным отсутствием сотрудника.',
        employeeId: 'employee-1',
        shiftId: 'shift-1',
        date: '2026-09-20',
      },
    ]);
  });

  it('does not treat OFF as a conflict', () => {
    expect(
      validateShiftAbsenceConflicts(
        { ...snapshot, shifts: [snapshot.shifts[1]] },
        [
          {
            id: 'absence-1',
            employeeId: 'employee-1',
            type: AbsenceType.SICK,
            startDate: new Date('2026-09-21T00:00:00.000Z'),
            endDate: new Date('2026-09-21T00:00:00.000Z'),
          },
        ],
      ),
    ).toEqual([]);
  });

  it('does not block shifts outside the range or for another employee', () => {
    expect(
      validateShiftAbsenceConflicts(snapshot, [
        {
          id: 'absence-2',
          employeeId: 'employee-2',
          type: AbsenceType.TRAINING,
          startDate: new Date('2026-09-20T00:00:00.000Z'),
          endDate: new Date('2026-09-20T00:00:00.000Z'),
        },
        {
          id: 'absence-3',
          employeeId: 'employee-1',
          type: AbsenceType.UNAVAILABLE,
          startDate: new Date('2026-09-22T00:00:00.000Z'),
          endDate: new Date('2026-09-22T00:00:00.000Z'),
        },
      ]),
    ).toEqual([]);
  });
});
