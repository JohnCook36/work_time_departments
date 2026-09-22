import { describe, expect, it } from 'vitest';

import {
  applyExcelImportEntries,
  ExcelImportEntry,
  resolveApplicableExcelImportEntries,
} from './importExcel';
import { ScheduleData } from './types';

const entry = (
  day: number,
  value: string,
  employeeId: string | null = 'employee'
): ExcelImportEntry => ({
  employeeName: 'Тестовый сотрудник',
  employeeId,
  day,
  value,
});

describe('applyExcelImportEntries', () => {
  it('returns counters synchronously with the schedule that will be stored', () => {
    const result = applyExcelImportEntries({
      currentSchedule: {},
      entries: [entry(1, '08:00-17:00'), entry(32, '09:00-18:00')],
      daysInMonth: 30,
      overwriteExisting: false,
    });

    expect(result.applied).toBe(1);
    expect(result.skippedOutsideMonth).toBe(1);
    expect(result.skippedProtected).toBe(0);
    expect(result.schedule.employee[1]).toEqual({
      type: 'shift',
      shift: { start: '08:00', end: '17:00' },
    });
  });

  it('counts a protected existing cell without overwriting it', () => {
    const currentSchedule: ScheduleData = {
      employee: {
        1: {
          type: 'shift',
          shift: { start: '08:00', end: '17:00' },
        },
      },
    };

    const result = applyExcelImportEntries({
      currentSchedule,
      entries: [entry(1, '15:00-23:00')],
      daysInMonth: 30,
      overwriteExisting: false,
    });

    expect(result.applied).toBe(0);
    expect(result.skippedProtected).toBe(1);
    expect(result.schedule.employee[1]).toEqual(currentSchedule.employee[1]);
  });

  it('protects an effective fixed-schedule cell even when raw schedule is empty', () => {
    const protectedSchedule: ScheduleData = {
      employee: {
        1: {
          type: 'shift',
          shift: { start: '09:00', end: '18:00' },
        },
      },
    };

    const result = applyExcelImportEntries({
      currentSchedule: {},
      protectedSchedule,
      entries: [entry(1, '15:00-23:00')],
      daysInMonth: 30,
      overwriteExisting: false,
    });

    expect(result.applied).toBe(0);
    expect(result.skippedProtected).toBe(1);
    expect(result.schedule).toEqual({});
  });

  it('returns only entries that may be sent to the server', () => {
    const protectedSchedule: ScheduleData = {
      employee: {
        1: {
          type: 'shift',
          shift: { start: '08:00', end: '17:00' },
        },
      },
    };

    const result = resolveApplicableExcelImportEntries({
      currentSchedule: {},
      protectedSchedule,
      entries: [
        entry(1, '15:00-23:00'),
        entry(2, '09:00-18:00'),
        entry(32, '10:00-19:00'),
        entry(3, '08:00-17:00', null),
      ],
      daysInMonth: 30,
      overwriteExisting: false,
    });

    expect(result.entries).toEqual([entry(2, '09:00-18:00')]);
    expect(result.skippedProtected).toBe(1);
    expect(result.skippedOutsideMonth).toBe(1);
  });

  it('overwrites an existing cell only when explicitly enabled', () => {
    const currentSchedule: ScheduleData = {
      employee: {
        1: {
          type: 'shift',
          shift: { start: '08:00', end: '17:00' },
        },
      },
    };

    const result = applyExcelImportEntries({
      currentSchedule,
      entries: [entry(1, '15:00-23:00')],
      daysInMonth: 30,
      overwriteExisting: true,
    });

    expect(result.applied).toBe(1);
    expect(result.skippedProtected).toBe(0);
    expect(result.schedule.employee[1]).toEqual({
      type: 'shift',
      shift: { start: '15:00', end: '23:00' },
    });
  });
});
