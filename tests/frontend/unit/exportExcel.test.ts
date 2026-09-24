import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { buildScheduleWorkbook, exportScheduleToExcel } from '../../../src/services/excel/exportExcel';
import { getPrintWeekRanges } from '../../../src/services/print/printSchedule';
import type { Department, Employee, ScheduleData, ShiftCode } from '../../../src/domain/models';

const departments: Department[] = [
  { id: 'b', name: 'Отдел Б', kind: 'general' },
  { id: 'a', name: 'Отдел А', kind: 'general' },
];
const employees: Employee[] = [
  { id: 'two', name: 'Сотрудник 2', departmentId: 'b' },
  { id: 'one', name: 'Сотрудник 1', departmentId: 'b' },
  { id: 'three', name: 'Сотрудник 3', departmentId: 'a' },
];
const shift = { type: 'shift' as const, shift: { start: '08:00', end: '17:00', code: 'E' as const } };
const schedule: ScheduleData = { two: { 1: shift, 2: { type: 'off' }, 7: shift, 30: shift } };
const options = { departments, employees, schedule, year: 2026, month: 8, daysInMonth: 30 };

describe('Excel month and calendar week export', () => {
  it('preserves monthly headers, employee order, single rows, totals and print formatting', () => {
    const book = buildScheduleWorkbook(options);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['График', 'Часы']);
    const sheet = book.getWorksheet('График')!;
    expect(sheet.columnCount).toBe(35);
    expect(sheet.getRow(1).values).toEqual([undefined, 'Сотрудник',
      ...Array.from({ length: 30 }, (_, i) => ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date(2026, 8, i + 1).getDay()] + '\n' + (i + 1)),
      'Днев.', 'Ночн.', 'Итого', 'Дней']);
    expect([2, 3, 4, 5, 6, 7].map((row) => sheet.getCell(row, 1).value)).toEqual([
      'Отдел Б · 2 сотрудников', 'Сотрудник 2', 'Сотрудник 1', 'Отдел А · 1 сотрудников', 'Сотрудник 3', 'ИТОГО В СМЕНЕ',
    ]);
    expect(sheet.getCell('B3').value).toBe('08:00-17:00');
    expect(sheet.getCell('C3').value).toBe('OFF');
    expect((sheet.getRow(3).values as ExcelJS.CellValue[]).slice(-4)).toEqual([24, 0, 24, 3]);
    expect(sheet.pageSetup.orientation).toBe('landscape');
    expect(sheet.views).toEqual([{ state: 'frozen', xSplit: 1, ySplit: 1 }]);
    expect(sheet.getColumn(1).width).toBe(28);
    expect(sheet.getRow(3).height).toBe(24);
    expect(book.getWorksheet('Часы')!.getRow(3).height).toBe(42);
  });

  it('exports exactly the full Monday–Sunday boundary week and calculates only that range', async () => {
    const book = buildScheduleWorkbook({ ...options, rangeKey: 'week:2026-08-31', schedules: {
      '2026-08': { two: { 30: shift, 31: { type: 'shift', shift: { start: '20:00', end: '08:00', code: 'N' } } } },
      '2026-09': { two: { 1: { type: 'off' } } }, // current schedule wins
    } });
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await book.xlsx.writeBuffer());
    for (const sheet of loaded.worksheets) {
      expect(sheet.columnCount).toBe(12);
      expect((sheet.getRow(1).values as ExcelJS.CellValue[]).slice(2, 9)).toEqual([
        'Пн\n31.08.2026', 'Вт\n01.09.2026', 'Ср\n02.09.2026', 'Чт\n03.09.2026',
        'Пт\n04.09.2026', 'Сб\n05.09.2026', 'Вс\n06.09.2026',
      ]);
      expect((sheet.getRow(3).values as ExcelJS.CellValue[]).slice(-4)).toEqual([12, 8, 20, 2]);
      expect((sheet.getRow(7).values as ExcelJS.CellValue[]).slice(-4)).toEqual([12, 8, 20, '']);
    }
    expect(loaded.getWorksheet('График')!.getCell('B3').value).toBe('20:00-08:00');
    expect(loaded.getWorksheet('График')!.getCell('C3').value).toBe('08:00-17:00');
    expect(loaded.getWorksheet('График')!.getCell('D3').value).toBe('OFF');
    expect(loaded.getWorksheet('Часы')!.getCell('B3').value).toBe('Д 4\nН 8\nΣ 12');
  });

  it.each<ShiftCode>(['E', 'IN', 'INN', 'L', 'N'])('exports actual time for internal code %s', (code) => {
    const book = buildScheduleWorkbook({ ...options, rangeKey: 'week:2026-09-07', schedule: {
      two: { 7: { type: 'shift', shift: { start: '08:00', end: '17:00', code } } },
    } });
    expect(book.getWorksheet('График')!.getCell('B3').value).toBe('08:00-17:00');
  });

  it.each([[2026, 8], [2026, 11], [2027, 0]])('uses print weeks including next month/year for %i/%i', (year, month) => {
    for (const range of getPrintWeekRanges(year, month)) {
      const sheet = buildScheduleWorkbook({ ...options, year, month, rangeKey: range.key }).getWorksheet('График')!;
      expect(sheet.columnCount).toBe(12);
      expect(String(sheet.getCell('B1').value)).toMatch(/^Пн\n/);
      expect(String(sheet.getCell('H1').value)).toMatch(/^Вс\n/);
      range.days.forEach((day, i) => expect(sheet.getCell(1, i + 2).value).toContain(
        String(day.day).padStart(2, '0') + '.' + String(day.month + 1).padStart(2, '0') + '.' + day.year,
      ));
    }
  });

  it('rejects an obsolete week instead of silently exporting a different range', () => {
    expect(() => buildScheduleWorkbook({ ...options, rangeKey: 'week:2020-01-01' })).toThrow();
  });

  it.each([
    ['month', 'work-time-departments_2026-09.xlsx'],
    ['week:2026-08-31', 'work-time-departments_week-2026-08-31_to_2026-09-06.xlsx'],
  ])('downloads a valid workbook for %s', async (rangeKey, name) => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    let downloaded = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloaded = this.download; });
    try {
      await exportScheduleToExcel({ ...options, rangeKey });
      expect(downloaded).toBe(name);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    } finally { vi.unstubAllGlobals(); }
  });
});
