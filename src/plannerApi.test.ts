import { describe, expect, it } from 'vitest';

import {
  buildDepartmentReorderInput,
  buildEmployeeMoveInput,
  buildEmployeeReorderInput,
  buildScheduleCellChange,
  DepartmentScheduleResponse,
  mapDepartmentScheduleResponses,
} from './plannerApi';

function response(
  overrides: Partial<DepartmentScheduleResponse> = {},
): DepartmentScheduleResponse {
  return {
    period: { year: 2026, month: 9 },
    schedule: {
      id: 'schedule-1',
      updatedAt: '2026-09-19T12:00:00.000Z',
    },
    department: {
      id: 'department-1',
      name: 'Тестовый отдел',
      kind: 'FO',
    },
    employees: [
      {
        id: 'employee-1',
        displayName: 'Тестовый сотрудник',
        employmentRate: 0.75,
        scheduleMode: 'FIXED_WEEKDAYS',
        fixedStartTime: '08:00',
        fixedEndTime: '17:00',
        position: 0,
        updatedAt: '2026-09-19T11:00:00.000Z',
      },
    ],
    shifts: [
      {
        id: 'shift-1',
        employeeId: 'employee-1',
        date: '2026-09-18',
        code: 'E',
        startTime: '08:00',
        endTime: '17:00',
        isOff: false,
        updatedAt: '2026-09-19T12:00:00.000Z',
      },
      {
        id: 'shift-2',
        employeeId: 'employee-1',
        date: '2026-09-19',
        code: null,
        startTime: null,
        endTime: null,
        isOff: true,
        updatedAt: '2026-09-19T12:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('mapDepartmentScheduleResponses', () => {
  it('maps server Department and Employee ids without generating local ids', () => {
    const snapshot = mapDepartmentScheduleResponses([response()]);

    expect(snapshot.departments).toEqual([
      { id: 'department-1', name: 'Тестовый отдел', kind: 'fo' },
    ]);
    expect(snapshot.employees).toEqual([
      {
        id: 'employee-1',
        name: 'Тестовый сотрудник',
        departmentId: 'department-1',
        employmentRate: 0.75,
        scheduleMode: 'fixed-weekdays',
        fixedStartTime: '08:00',
        fixedEndTime: '17:00',
      },
    ]);
  });

  it('preserves Employee updatedAt metadata for optimistic updates', () => {
    const snapshot = mapDepartmentScheduleResponses([response()]);

    expect(snapshot.employeeMetadata['employee-1']).toEqual({
      updatedAt: '2026-09-19T11:00:00.000Z',
    });
  });

  it('maps persisted Shift rows into raw planner cells', () => {
    const snapshot = mapDepartmentScheduleResponses([response()]);

    expect(snapshot.schedule['employee-1'][18]).toEqual({
      type: 'shift',
      shift: {
        start: '08:00',
        end: '17:00',
        code: 'E',
      },
    });
    expect(snapshot.schedule['employee-1'][19]).toEqual({ type: 'off' });
  });

  it('does not invent unsupported codes and exposes incomplete server shifts as errors', () => {
    const snapshot = mapDepartmentScheduleResponses([
      response({
        shifts: [
          {
            id: 'shift-3',
            employeeId: 'employee-1',
            date: '2026-09-20',
            code: 'CUSTOM',
            startTime: '10:00',
            endTime: '19:00',
            isOff: false,
            updatedAt: '2026-09-19T12:00:00.000Z',
          },
          {
            id: 'shift-4',
            employeeId: 'employee-1',
            date: '2026-09-21',
            code: null,
            startTime: '10:00',
            endTime: null,
            isOff: false,
            updatedAt: '2026-09-19T12:00:00.000Z',
          },
        ],
      }),
    ]);

    expect(snapshot.schedule['employee-1'][20]).toEqual({
      type: 'shift',
      shift: { start: '10:00', end: '19:00' },
    });
    expect(snapshot.schedule['employee-1'][21]).toEqual({
      type: 'error',
      error: 'Серверная смена содержит неполные данные',
    });
  });

  it('normalizes unsupported employment rates to the supported full-time default', () => {
    const snapshot = mapDepartmentScheduleResponses([
      response({
        employees: [
          {
            id: 'employee-1',
            displayName: 'Тестовый сотрудник',
            employmentRate: 0.6,
            scheduleMode: 'FLEXIBLE',
            fixedStartTime: null,
            fixedEndTime: null,
            position: 0,
            updatedAt: '2026-09-19T11:00:00.000Z',
          },
        ],
      }),
    ]);

    expect(snapshot.employees[0]).toMatchObject({
      employmentRate: 1,
      scheduleMode: 'flexible',
    });
  });
});


describe('department reorder contract', () => {
  it('preserves Department updatedAt metadata from manageable departments', () => {
    const snapshot = mapDepartmentScheduleResponses(
      [response()],
      [
        {
          id: 'department-1',
          name: 'Тестовый отдел',
          kind: 'FO',
          position: 0,
          updatedAt: '2026-09-19T10:00:00.000Z',
        },
      ],
    );

    expect(snapshot.departmentMetadata['department-1']).toEqual({
      updatedAt: '2026-09-19T10:00:00.000Z',
    });
  });

  it('builds a full Department reorder with optimistic metadata', () => {
    expect(
      buildDepartmentReorderInput(
        ['department-b', 'department-a'],
        {
          'department-a': { updatedAt: '2026-09-19T09:00:00.000Z' },
          'department-b': { updatedAt: '2026-09-19T09:05:00.000Z' },
        },
      ),
    ).toEqual({
      orderedDepartmentIds: ['department-b', 'department-a'],
      expectedUpdatedAtByDepartmentId: {
        'department-a': '2026-09-19T09:00:00.000Z',
        'department-b': '2026-09-19T09:05:00.000Z',
      },
    });
  });

  it('refuses Department reorder when optimistic metadata is incomplete', () => {
    expect(() =>
      buildDepartmentReorderInput(
        ['department-a', 'department-b'],
        {
          'department-a': { updatedAt: '2026-09-19T09:00:00.000Z' },
        },
      ),
    ).toThrow('Missing Department optimistic metadata for reorder');
  });
});

describe('employee reorder contract', () => {
  it('builds a full department reorder with optimistic metadata', () => {
    expect(
      buildEmployeeReorderInput(
        'department-a',
        ['employee-b', 'employee-a'],
        {
          'employee-a': { updatedAt: '2026-09-19T09:00:00.000Z' },
          'employee-b': { updatedAt: '2026-09-19T09:05:00.000Z' },
        },
      ),
    ).toEqual({
      departmentId: 'department-a',
      orderedEmployeeIds: ['employee-b', 'employee-a'],
      expectedUpdatedAtByEmployeeId: {
        'employee-a': '2026-09-19T09:00:00.000Z',
        'employee-b': '2026-09-19T09:05:00.000Z',
      },
    });
  });

  it('refuses reorder when Employee optimistic metadata is incomplete', () => {
    expect(() =>
      buildEmployeeReorderInput(
        'department-a',
        ['employee-a', 'employee-b'],
        {
          'employee-a': { updatedAt: '2026-09-19T09:00:00.000Z' },
        },
      ),
    ).toThrow('Missing Employee optimistic metadata for reorder');
  });
});

describe('employee move contract', () => {
  it('builds a cross-department move with Employee optimistic metadata', () => {
    expect(
      buildEmployeeMoveInput('department-b', {
        updatedAt: '2026-09-19T11:00:00.000Z',
      }),
    ).toEqual({
      departmentId: 'department-b',
      expectedUpdatedAt: '2026-09-19T11:00:00.000Z',
    });
  });
});

describe('planner write contract', () => {
  it('preserves persisted Shift metadata for optimistic locking', () => {
    const snapshot = mapDepartmentScheduleResponses([response()]);

    expect(snapshot.cellMetadata['employee-1'][18]).toEqual({
      shiftId: 'shift-1',
      updatedAt: '2026-09-19T12:00:00.000Z',
    });
    expect(snapshot.cellMetadata['employee-1'][19]).toEqual({
      shiftId: 'shift-2',
      updatedAt: '2026-09-19T12:00:00.000Z',
    });
  });

  it('builds a shift change with the loaded updatedAt value', () => {
    expect(
      buildScheduleCellChange(
        'employee-1',
        18,
        {
          type: 'shift',
          shift: { start: '20:00', end: '08:00', code: 'N' },
        },
        {
          shiftId: 'shift-1',
          updatedAt: '2026-09-19T12:00:00.000Z',
        },
      ),
    ).toEqual({
      employeeId: 'employee-1',
      day: 18,
      type: 'shift',
      startTime: '20:00',
      endTime: '08:00',
      code: 'N',
      expectedUpdatedAt: '2026-09-19T12:00:00.000Z',
    });
  });

  it('uses expectedUpdatedAt=null when creating a previously empty server cell', () => {
    expect(
      buildScheduleCellChange('employee-1', 20, { type: 'off' }),
    ).toEqual({
      employeeId: 'employee-1',
      day: 20,
      type: 'off',
      expectedUpdatedAt: null,
    });
  });

  it('keeps optimistic metadata when clearing a persisted cell', () => {
    expect(
      buildScheduleCellChange(
        'employee-1',
        19,
        { type: 'empty' },
        {
          shiftId: 'shift-2',
          updatedAt: '2026-09-19T12:00:00.000Z',
        },
      ),
    ).toEqual({
      employeeId: 'employee-1',
      day: 19,
      type: 'empty',
      expectedUpdatedAt: '2026-09-19T12:00:00.000Z',
    });
  });

  it('refuses to persist an invalid planner entry', () => {
    expect(() =>
      buildScheduleCellChange('employee-1', 21, {
        type: 'error',
        error: 'invalid',
      }),
    ).toThrow('Cannot persist an invalid schedule entry');
  });
});
