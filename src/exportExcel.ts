import ExcelJS from 'exceljs';
import { Department, Employee, ScheduleData, ShiftEntry } from './types';
import {
  calculateShiftHours,
  DAY_NAMES_SHORT,
  getDayOfWeek,
  MONTH_NAMES,
} from './utils';

type ExcelWorkbook = InstanceType<typeof ExcelJS.Workbook>;
type Worksheet = ReturnType<ExcelWorkbook['addWorksheet']>;
type Row = ReturnType<Worksheet['addRow']>;

interface ExportScheduleOptions {
  departments: Department[];
  employees: Employee[];
  schedule: ScheduleData;
  year: number;
  month: number;
  daysInMonth: number;
}

function getEntry(
  schedule: ScheduleData,
  employeeId: string,
  day: number
): ShiftEntry {
  return schedule[employeeId]?.[day] || { type: 'empty' };
}

function getScheduleCellValue(entry: ShiftEntry): string {
  if (entry.type === 'off') return 'OFF';
  if (entry.type === 'error') return '⚠';
  if (entry.type !== 'shift' || !entry.shift) return '';

  return entry.shift.start + '-' + entry.shift.end;
}

function getEmployeeTotals(
  schedule: ScheduleData,
  employeeId: string,
  daysInMonth: number
) {
  let day = 0;
  let night = 0;
  let total = 0;
  let workDays = 0;

  for (let currentDay = 1; currentDay <= daysInMonth; currentDay++) {
    const entry = getEntry(schedule, employeeId, currentDay);
    if (entry.type !== 'shift') continue;

    const hours = calculateShiftHours(entry);
    day += hours.day;
    night += hours.night;
    total += hours.total;
    workDays += 1;
  }

  return {
    day: Math.round(day * 100) / 100,
    night: Math.round(night * 100) / 100,
    total: Math.round(total * 100) / 100,
    workDays,
  };
}

function applyWorkbookSheetLayout(
  sheet: Worksheet,
  daysInMonth: number
) {
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  sheet.pageSetup.orientation = 'landscape';
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;
  sheet.pageSetup.paperSize = 9;
  sheet.pageSetup.margins = {
    left: 0.25,
    right: 0.25,
    top: 0.35,
    bottom: 0.35,
    header: 0.15,
    footer: 0.15,
  };

  sheet.getColumn(1).width = 28;

  for (let day = 1; day <= daysInMonth; day++) {
    sheet.getColumn(day + 1).width = 9;
  }

  for (let column = daysInMonth + 2; column <= daysInMonth + 5; column++) {
    sheet.getColumn(column).width = 10;
  }
}

function styleHeader(
  row: Row,
  year: number,
  month: number,
  daysInMonth: number
) {
  row.height = 30;
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };

  row.eachCell((cell, columnNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF475569' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      bottom: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } },
    };

    if (columnNumber >= 2 && columnNumber <= daysInMonth + 1) {
      const day = columnNumber - 1;
      const dayOfWeek = getDayOfWeek(year, month, day);
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF7F1D1D' },
        };
      }
    }
  });
}

function styleDepartmentRow(
  sheet: Worksheet,
  row: Row,
  totalColumns: number
) {
  sheet.mergeCells(row.number, 1, row.number, totalColumns);
  row.height = 24;
  row.font = { bold: true, color: { argb: 'FF111827' } };
  row.alignment = { vertical: 'middle' };
  row.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };
  row.getCell(1).border = {
    top: { style: 'medium', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
  };
}

function styleDataRow(
  row: Row,
  year: number,
  month: number,
  daysInMonth: number
) {
  row.alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };

  row.getCell(1).alignment = {
    horizontal: 'left',
    vertical: 'middle',
    wrapText: true,
  };
  row.getCell(1).font = { bold: true };

  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };

    if (columnNumber >= 2 && columnNumber <= daysInMonth + 1) {
      const day = columnNumber - 1;
      const dayOfWeek = getDayOfWeek(year, month, day);
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF7ED' },
        };
      }
    }
  });
}

function buildHeaders(
  year: number,
  month: number,
  daysInMonth: number
): string[] {
  const dayHeaders = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const dayOfWeek = getDayOfWeek(year, month, day);
    return DAY_NAMES_SHORT[dayOfWeek] + '\n' + day;
  });

  return ['Сотрудник', ...dayHeaders, 'Днев.', 'Ночн.', 'Итого', 'Дней'];
}

function addDepartmentRows(
  sheet: Worksheet,
  departments: Department[],
  employees: Employee[],
  schedule: ScheduleData,
  year: number,
  month: number,
  daysInMonth: number,
  mode: 'schedule' | 'hours'
) {
  const totalColumns = daysInMonth + 5;

  departments.forEach((department) => {
    const departmentEmployees = employees.filter(
      (employee) => employee.departmentId === department.id
    );

    const departmentRow = sheet.addRow([
      department.name + ' · ' + departmentEmployees.length + ' сотрудников',
    ]);
    styleDepartmentRow(sheet, departmentRow, totalColumns);

    departmentEmployees.forEach((employee) => {
      const totals = getEmployeeTotals(
        schedule,
        employee.id,
        daysInMonth
      );

      const values = Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const entry = getEntry(schedule, employee.id, day);

        if (mode === 'schedule') {
          return getScheduleCellValue(entry);
        }

        if (entry.type === 'off') return 'OFF';
        if (entry.type === 'error') return '⚠';
        if (entry.type !== 'shift') return '';

        const hours = calculateShiftHours(entry);
        return 'Д ' + hours.day + '\nН ' + hours.night + '\nΣ ' + hours.total;
      });

      const employeeRow = sheet.addRow([
        employee.name,
        ...values,
        totals.day,
        totals.night,
        totals.total,
        totals.workDays,
      ]);
      employeeRow.height = mode === 'hours' ? 42 : 24;
      styleDataRow(employeeRow, year, month, daysInMonth);

    });
  });
}

function addDailyTotals(
  sheet: Worksheet,
  employees: Employee[],
  schedule: ScheduleData,
  daysInMonth: number,
  mode: 'schedule' | 'hours'
) {
  const dailyValues = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;

    if (mode === 'schedule') {
      return employees.reduce((count, employee) => {
        return getEntry(schedule, employee.id, day).type === 'shift'
          ? count + 1
          : count;
      }, 0);
    }

    const total = employees.reduce((sum, employee) => {
      const entry = getEntry(schedule, employee.id, day);
      return entry.type === 'shift'
        ? sum + calculateShiftHours(entry).total
        : sum;
    }, 0);

    return Math.round(total * 100) / 100;
  });

  const totalDay = employees.reduce(
    (sum, employee) =>
      sum + getEmployeeTotals(schedule, employee.id, daysInMonth).day,
    0
  );
  const totalNight = employees.reduce(
    (sum, employee) =>
      sum + getEmployeeTotals(schedule, employee.id, daysInMonth).night,
    0
  );
  const totalHours = employees.reduce(
    (sum, employee) =>
      sum + getEmployeeTotals(schedule, employee.id, daysInMonth).total,
    0
  );

  const row = sheet.addRow([
    mode === 'schedule' ? 'ИТОГО В СМЕНЕ' : 'ИТОГО ЧАСОВ',
    ...dailyValues,
    Math.round(totalDay * 100) / 100,
    Math.round(totalNight * 100) / 100,
    Math.round(totalHours * 100) / 100,
    '',
  ]);

  row.font = { bold: true };
  row.height = 24;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFF6FF' },
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF60A5FA' } },
      bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      right: { style: 'thin', color: { argb: 'FFBFDBFE' } },
    };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
  });
  row.getCell(1).alignment = {
    horizontal: 'left',
    vertical: 'middle',
  };
}

function downloadWorkbook(buffer: unknown, fileName: string) {
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportScheduleToExcel({
  departments,
  employees,
  schedule,
  year,
  month,
  daysInMonth,
}: ExportScheduleOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Work time departments';
  workbook.created = new Date();

  const headers = buildHeaders(year, month, daysInMonth);

  const scheduleSheet = workbook.addWorksheet('График');
  applyWorkbookSheetLayout(scheduleSheet, daysInMonth);
  const scheduleHeader = scheduleSheet.addRow(headers);
  styleHeader(scheduleHeader, year, month, daysInMonth);
  addDepartmentRows(
    scheduleSheet,
    departments,
    employees,
    schedule,
    year,
    month,
    daysInMonth,
    'schedule'
  );
  addDailyTotals(
    scheduleSheet,
    employees,
    schedule,
    daysInMonth,
    'schedule'
  );

  const hoursSheet = workbook.addWorksheet('Часы');
  applyWorkbookSheetLayout(hoursSheet, daysInMonth);
  const hoursHeader = hoursSheet.addRow(headers);
  styleHeader(hoursHeader, year, month, daysInMonth);
  addDepartmentRows(
    hoursSheet,
    departments,
    employees,
    schedule,
    year,
    month,
    daysInMonth,
    'hours'
  );
  addDailyTotals(
    hoursSheet,
    employees,
    schedule,
    daysInMonth,
    'hours'
  );

  const buffer = await workbook.xlsx.writeBuffer();
  const period = String(month + 1).padStart(2, '0');
  const fileName =
    'work-time-departments_' + year + '-' + period + '.xlsx';

  downloadWorkbook(buffer, fileName);
}
