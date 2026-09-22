import ExcelJS from 'exceljs';
import { Employee, ScheduleData } from './types';
import { validateShiftInput } from './utils';

export interface ExcelImportEntry {
  employeeName: string;
  employeeId: string | null;
  day: number;
  value: string;
}

export interface ExcelImportInvalidCell {
  employeeName: string;
  day: number;
  scheduleValue: string;
  actualTimeValue: string;
  reason: string;
}

export interface ExcelImportPreview {
  fileName: string;
  sheetName: string;
  detectedDays: number[];
  entries: ExcelImportEntry[];
  matchedEmployees: string[];
  unknownEmployees: string[];
  ambiguousEmployees: string[];
  invalidCells: ExcelImportInvalidCell[];
  warnings: string[];
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

interface NormalizedImportValue {
  value: string | null;
  invalidReason: string | null;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }

  if (typeof value === 'object') {
    const maybeRich = value as {
      text?: string;
      result?: string | number;
      richText?: Array<{ text?: string }>;
    };

    if (maybeRich.text) return String(maybeRich.text).trim();
    if (maybeRich.result !== undefined) return String(maybeRich.result).trim();
    if (Array.isArray(maybeRich.richText)) {
      return maybeRich.richText
        .map((item) => item.text || '')
        .join('')
        .trim();
    }
  }

  return String(value).trim();
}

function extractDay(header: string): number | null {
  const matches = header.match(/(\d{1,2})(?!.*\d)/);
  if (!matches) return null;

  const day = Number(matches[1]);
  return day >= 1 && day <= 31 ? day : null;
}

function isDepartmentRow(firstCell: string, rowValues: string[]): boolean {
  if (!firstCell) return false;

  const nonEmpty = rowValues.filter(Boolean);
  return (
    nonEmpty.length === 1 &&
    (/сотрудник/i.test(firstCell) || /отдел/i.test(firstCell))
  );
}

function normalizeImportedShift(
  scheduleValue: string,
  actualTimeValue: string
): NormalizedImportValue {
  const schedule = scheduleValue.trim();
  const actual = actualTimeValue.trim();

  if (!schedule && !actual) {
    return { value: null, invalidReason: null };
  }

  if (/^OFF$/i.test(schedule)) {
    return { value: 'OFF', invalidReason: null };
  }

  if (schedule === '⚠') {
    return {
      value: null,
      invalidReason: 'В исходной таблице ячейка уже помечена ошибкой.',
    };
  }

  const code = /^(E|IN|INN|L|N)$/i.test(schedule)
    ? schedule.toUpperCase()
    : null;

  if (code && !actual) {
    return {
      value: null,
      invalidReason: 'Указан код смены, но отсутствует полное время начала и окончания.',
    };
  }

  const candidates: string[] = [];

  if (code && actual) {
    candidates.push(code + ' ' + actual);
  }

  if (schedule && !code) {
    candidates.push(schedule);
  }

  if (actual) {
    candidates.push(actual);
  }

  for (const candidate of candidates) {
    const parsed = validateShiftInput(candidate);
    if (parsed.type === 'shift' || parsed.type === 'off') {
      return { value: candidate, invalidReason: null };
    }
  }

  return {
    value: null,
    invalidReason:
      'Не удалось распознать смену. Ожидается OFF или время вида 08:00-17:00 с необязательным кодом E / IN / INN / L / N.',
  };
}

export async function parseScheduleExcel(
  file: File,
  employees: Employee[]
): Promise<ExcelImportPreview> {
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();

  await workbook.xlsx.load(buffer as any);

  const worksheet =
    workbook.getWorksheet('График') || workbook.worksheets[0];

  if (!worksheet) {
    throw new Error('В Excel-файле не найдено ни одного листа.');
  }

  let headerRowNumber = -1;

  for (
    let rowNumber = 1;
    rowNumber <= Math.min(12, worksheet.rowCount);
    rowNumber++
  ) {
    const first = cellText(worksheet.getRow(rowNumber).getCell(1).value);
    if (/^сотрудник$/i.test(first)) {
      headerRowNumber = rowNumber;
      break;
    }
  }

  if (headerRowNumber === -1) {
    throw new Error(
      'Не найдена строка заголовка. В первой колонке должна быть ячейка «Сотрудник».'
    );
  }

  const headerRow = worksheet.getRow(headerRowNumber);
  const dayColumns = new Map<number, number>();
  const seenDays = new Set<number>();
  const duplicateDays = new Set<number>();

  for (let column = 2; column <= headerRow.cellCount; column++) {
    const day = extractDay(cellText(headerRow.getCell(column).value));
    if (day === null) continue;

    if (seenDays.has(day)) {
      duplicateDays.add(day);
    }

    seenDays.add(day);
    dayColumns.set(column, day);
  }

  if (dayColumns.size === 0) {
    throw new Error('Не удалось определить колонки с днями месяца.');
  }

  const employeesByName = new Map<string, Employee[]>();

  employees.forEach((employee) => {
    const key = normalizeName(employee.name);
    const current = employeesByName.get(key) || [];
    current.push(employee);
    employeesByName.set(key, current);
  });

  const matchedEmployees = new Set<string>();
  const unknownEmployees = new Set<string>();
  const ambiguousEmployees = new Set<string>();
  const warnings: string[] = [];
  const entries: ExcelImportEntry[] = [];
  const invalidCells: ExcelImportInvalidCell[] = [];

  for (
    let rowNumber = headerRowNumber + 1;
    rowNumber <= worksheet.rowCount;
    rowNumber++
  ) {
    const row = worksheet.getRow(rowNumber);
    const firstCell = cellText(row.getCell(1).value);

    if (!firstCell || /^факт$/i.test(firstCell) || /^итого/i.test(firstCell)) {
      continue;
    }

    const rowValues = Array.from(
      { length: Math.max(row.cellCount, headerRow.cellCount) },
      (_, index) => cellText(row.getCell(index + 1).value)
    );

    if (isDepartmentRow(firstCell, rowValues)) {
      continue;
    }

    const nextRow = worksheet.getRow(rowNumber + 1);
    const hasActualRow = /^факт$/i.test(
      cellText(nextRow.getCell(1).value)
    );

    const employeeMatches =
      employeesByName.get(normalizeName(firstCell)) || [];
    const employee =
      employeeMatches.length === 1 ? employeeMatches[0] : undefined;

    if (employeeMatches.length === 1 && employee) {
      matchedEmployees.add(employee.name);
    } else if (employeeMatches.length > 1) {
      ambiguousEmployees.add(firstCell);
    } else {
      unknownEmployees.add(firstCell);
    }

    for (const [column, day] of dayColumns) {
      const scheduleValue = cellText(row.getCell(column).value);
      const actualValue = hasActualRow
        ? cellText(nextRow.getCell(column).value)
        : '';

      const normalized = normalizeImportedShift(
        scheduleValue,
        actualValue
      );

      if (normalized.invalidReason) {
        invalidCells.push({
          employeeName: firstCell,
          day,
          scheduleValue,
          actualTimeValue: actualValue,
          reason: normalized.invalidReason,
        });
        continue;
      }

      if (!normalized.value) continue;

      entries.push({
        employeeName: firstCell,
        employeeId: employee?.id || null,
        day,
        value: normalized.value,
      });
    }

    if (hasActualRow) rowNumber += 1;
  }

  if (unknownEmployees.size > 0) {
    warnings.push(
      'Неизвестные сотрудники не будут импортированы автоматически.'
    );
  }

  if (ambiguousEmployees.size > 0) {
    warnings.push(
      'Сотрудники с одинаковыми именами требуют ручного уточнения и будут пропущены.'
    );
  }

  if (duplicateDays.size > 0) {
    warnings.push(
      'В заголовке Excel повторяются дни: ' +
        [...duplicateDays].sort((a, b) => a - b).join(', ') +
        '. Проверьте файл перед импортом.'
    );
  }

  if (invalidCells.length > 0) {
    warnings.push(
      'Некорректные смены не будут импортированы. Исправьте их в Excel или в приложении.'
    );
  }

  if (entries.filter((entry) => entry.employeeId !== null).length === 0) {
    warnings.push(
      'Для существующих сотрудников не найдено ни одной распознаваемой смены.'
    );
  }

  return {
    fileName: file.name,
    sheetName: worksheet.name,
    detectedDays: [...seenDays].sort((a, b) => a - b),
    entries,
    matchedEmployees: [...matchedEmployees],
    unknownEmployees: [...unknownEmployees],
    ambiguousEmployees: [...ambiguousEmployees],
    invalidCells,
    warnings,
  };
}
