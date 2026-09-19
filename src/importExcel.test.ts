import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { parseScheduleExcel } from './importExcel';
import type { Employee } from './types';

async function workbookFile(
  rows: Array<Array<string | number>>,
  fileName = 'schedule.xlsx',
): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('График');
  rows.forEach((row) => sheet.addRow(row));
  const bytes = await workbook.xlsx.writeBuffer();
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const arrayBuffer = view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;

  return {
    name: fileName,
    arrayBuffer: async () => arrayBuffer,
  } as File;
}

const employees: Employee[] = [
  { id: 'anna', name: 'Анна', departmentId: 'front-office' },
  { id: 'duplicate-1', name: 'Дубль', departmentId: 'front-office' },
  { id: 'duplicate-2', name: '  ДУБЛЬ ', departmentId: 'night' },
];

describe('parseScheduleExcel', () => {
  it('matches employees and combines a shift code with the actual time row', async () => {
    const file = await workbookFile([
      ['Сотрудник', '1', '2'],
      ['Анна', 'E', 'OFF'],
      ['Факт', '08:00-17:00', ''],
    ]);

    const preview = await parseScheduleExcel(file, employees);

    expect(preview.matchedEmployees).toEqual(['Анна']);
    expect(preview.detectedDays).toEqual([1, 2]);
    expect(preview.entries).toEqual([
      { employeeName: 'Анна', employeeId: 'anna', day: 1, value: 'E 08:00-17:00' },
      { employeeName: 'Анна', employeeId: 'anna', day: 2, value: 'OFF' },
    ]);
  });

  it('separates unknown and same-name employees instead of guessing an id', async () => {
    const file = await workbookFile([
      ['Сотрудник', '1'],
      ['Неизвестный', '15:00-23:00'],
      ['Дубль', '08:00-17:00'],
    ]);

    const preview = await parseScheduleExcel(file, employees);

    expect(preview.unknownEmployees).toEqual(['Неизвестный']);
    expect(preview.ambiguousEmployees).toEqual(['Дубль']);
    expect(preview.entries).toEqual([
      {
        employeeName: 'Неизвестный',
        employeeId: null,
        day: 1,
        value: '15:00-23:00',
      },
      {
        employeeName: 'Дубль',
        employeeId: null,
        day: 1,
        value: '08:00-17:00',
      },
    ]);
    expect(preview.warnings.join(' ')).toMatch(/Неизвестные сотрудники/);
    expect(preview.warnings.join(' ')).toMatch(/одинаковыми именами/);
  });

  it('reports invalid shifts without adding them to import entries', async () => {
    const file = await workbookFile([
      ['Сотрудник', '1', '2', '3'],
      ['Анна', 'bad value', 'N', '⚠'],
    ]);

    const preview = await parseScheduleExcel(file, employees);

    expect(preview.entries).toEqual([]);
    expect(preview.invalidCells).toHaveLength(3);
    expect(preview.invalidCells.map((cell) => cell.day)).toEqual([1, 2, 3]);
    expect(preview.invalidCells[1].reason).toMatch(/отсутствует полное время/);
    expect(preview.invalidCells[2].reason).toMatch(/помечена ошибкой/);
  });

  it('rejects a workbook without the employee header', async () => {
    const file = await workbookFile([['Имя', '1'], ['Анна', 'OFF']]);

    await expect(parseScheduleExcel(file, employees)).rejects.toThrow(
      'Не найдена строка заголовка',
    );
  });
});
