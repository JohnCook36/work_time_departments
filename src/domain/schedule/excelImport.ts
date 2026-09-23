import { ScheduleData } from '../models';
import { validateShiftInput } from './shiftHours';

export interface ExcelImportEntry {
  employeeName: string;
  employeeId: string | null;
  day: number;
  value: string;
}

export interface ApplyExcelImportResult {
  schedule: ScheduleData;
  applied: number;
  skippedProtected: number;
  skippedOutsideMonth: number;
}

export interface ApplyExcelImportOptions {
  currentSchedule: ScheduleData;
  protectedSchedule?: ScheduleData;
  entries: ExcelImportEntry[];
  daysInMonth: number;
  overwriteExisting: boolean;
}

export interface ResolvedExcelImportEntries {
  entries: ExcelImportEntry[];
  skippedProtected: number;
  skippedOutsideMonth: number;
}

interface ResolvedExcelImportApplication extends ResolvedExcelImportEntries {
  schedule: ScheduleData;
}

function resolveExcelImportApplication({
  currentSchedule,
  protectedSchedule = currentSchedule,
  entries,
  daysInMonth,
  overwriteExisting,
}: ApplyExcelImportOptions): ResolvedExcelImportApplication {
  const next: ScheduleData = { ...currentSchedule };
  const appliedEntries: ExcelImportEntry[] = [];
  let skippedProtected = 0;
  let skippedOutsideMonth = 0;

  entries.forEach((item) => {
    if (!item.employeeId) return;

    if (item.day < 1 || item.day > daysInMonth) {
      skippedOutsideMonth++;
      return;
    }

    const employeeSchedule = { ...(next[item.employeeId] || {}) };
    const existing =
      employeeSchedule[item.day] ?? protectedSchedule[item.employeeId]?.[item.day];

    if (!overwriteExisting && existing && existing.type !== 'empty') {
      skippedProtected++;
      return;
    }

    employeeSchedule[item.day] = validateShiftInput(item.value);
    next[item.employeeId] = employeeSchedule;
    appliedEntries.push(item);
  });

  return {
    schedule: next,
    entries: appliedEntries,
    skippedProtected,
    skippedOutsideMonth,
  };
}

export function resolveApplicableExcelImportEntries(
  options: ApplyExcelImportOptions,
): ResolvedExcelImportEntries {
  const result = resolveExcelImportApplication(options);

  return {
    entries: result.entries,
    skippedProtected: result.skippedProtected,
    skippedOutsideMonth: result.skippedOutsideMonth,
  };
}

export function applyExcelImportEntries(
  options: ApplyExcelImportOptions,
): ApplyExcelImportResult {
  const result = resolveExcelImportApplication(options);

  return {
    schedule: result.schedule,
    applied: result.entries.length,
    skippedProtected: result.skippedProtected,
    skippedOutsideMonth: result.skippedOutsideMonth,
  };
}
