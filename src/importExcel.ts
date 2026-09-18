import ExcelJS from 'exceljs';
import { Employee } from './types';

export interface ExcelImportEntry {
  employeeName: string;
  employeeId: string | null;
  day: number;
  value: string;
}

export interface ExcelImportPreview {
  fileName: string;
  sheetName: string;
  detectedDays: number[];
  entries: ExcelImportEntry[];
  matchedEmployees: string[];
  unknownEmployees: string[];
  warnings: string[];
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

function isDepartmentRow(
  firstCell: string,
  rowValues: string[]
): boolean {
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
): string | null {
  const schedule = scheduleValue.trim();
  const actual = actualTimeValue.trim();

  if (!schedule && !actual) return null;
  if (/^OFF$/i.test(schedule)) return 'OFF';
  if (schedule === '⚠') return null;

  const code = /^(E|IN|INN|L|N)$/i.test(schedule)
    ? schedule.toUpperCase()
    : null;

  const fullTime =
    actual.match(/^\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}$/)
      ? actual
      : schedule.match(/^\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}$/)
        ? schedule
        : null;

  if (fullTime) {
    return code ? code + ' ' + fullTime : fullTime;
  }

  return null;
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

  for (let rowNumber = 1; rowNumber <= Math.min(12, worksheet.rowCount); rowNumber++) {
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

  for (let column = 2; column <= headerRow.cellCount; column++) {
    const day = extractDay(cellText(headerRow.getCell(column).value));
    if (day !== null) dayColumns.set(column, day);
  }

  if (dayColumns.size === 0) {
    throw new Error('Не удалось определить колонки с днями месяца.');
  }

  const employeeByName = new Map(
    employees.map((employee) => [
      normalizeName(employee.name),
      employee,
    ])
  );

  const matchedEmployees = new Set<string>();
  const unknownEmployees = new Set<string>();
  const warnings: string[] = [];
  const entries: ExcelImportEntry[] = [];

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

    const employee = employeeByName.get(normalizeName(firstCell));

    if (employee) {
      matchedEmployees.add(employee.name);
    } else {
      unknownEmployees.add(firstCell);
    }

    for (const [column, day] of dayColumns) {
      const scheduleValue = cellText(row.getCell(column).value);
      const actualValue = hasActualRow
        ? cellText(nextRow.getCell(column).value)
        : '';

      const value = normalizeImportedShift(scheduleValue, actualValue);
      if (!value) continue;

      entries.push({
        employeeName: firstCell,
        employeeId: employee?.id || null,
        day,
        value,
      });
    }

    if (hasActualRow) rowNumber += 1;
  }

  if (unknownEmployees.size > 0) {
    warnings.push(
      'Неизвестные сотрудники не будут импортированы автоматически.'
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
    detectedDays: [...dayColumns.values()].sort((a, b) => a - b),
    entries,
    matchedEmployees: [...matchedEmployees],
    unknownEmployees: [...unknownEmployees],
    warnings,
  };
}
