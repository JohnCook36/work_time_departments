import {
  Department,
  Employee,
  ScheduleData,
  SchedulePeriodsData,
  ShiftEntry,
} from './types';
import { calculateShiftHours, DAY_NAMES_SHORT, getDayOfWeek, MONTH_NAMES } from './utils';

export interface WeekRange {
  key: string;
  start: number;
  end: number;
  label: string;
}

export interface PrintCalendarDay {
  year: number;
  month: number;
  day: number;
}

export interface PrintWeekRange {
  key: string;
  label: string;
  days: PrintCalendarDay[];
}

interface PrintScheduleOptions {
  departments: Department[];
  employees: Employee[];
  schedule: ScheduleData;
  schedules: SchedulePeriodsData;
  year: number;
  month: number;
  daysInMonth: number;
  rangeKey: string;
}


const MONTH_NAMES_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

function getPeriodKey(year: number, month: number): string {
  return year + '-' + String(month + 1).padStart(2, '0');
}

function toCalendarDay(date: Date): PrintCalendarDay {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  };
}

function formatCalendarDay(day: PrintCalendarDay, includeYear: boolean): string {
  return (
    day.day +
    ' ' +
    MONTH_NAMES_SHORT[day.month] +
    (includeYear ? ' ' + day.year : '')
  );
}

function formatPrintWeekLabel(days: PrintCalendarDay[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  const crossesYear = first.year !== last.year;

  if (first.year === last.year && first.month === last.month) {
    return first.day + '–' + last.day + ' ' + MONTH_NAMES_SHORT[first.month];
  }

  return (
    formatCalendarDay(first, crossesYear) +
    ' – ' +
    formatCalendarDay(last, crossesYear)
  );
}


function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getEntry(
  schedule: ScheduleData,
  employeeId: string,
  day: number
): ShiftEntry {
  return schedule[employeeId]?.[day] || { type: 'empty' };
}

function getEntryForCalendarDay(
  schedules: SchedulePeriodsData,
  employeeId: string,
  day: PrintCalendarDay
): ShiftEntry {
  const schedule = schedules[getPeriodKey(day.year, day.month)] || {};
  return getEntry(schedule, employeeId, day.day);
}

function getShiftHtml(entry: ShiftEntry): string {
  if (entry.type === 'off') {
    return '<span class="off">OFF</span>';
  }

  if (entry.type === 'error') {
    return '<span class="error">⚠</span>';
  }

  if (entry.type !== 'shift' || !entry.shift) {
    return '';
  }

  const main = entry.shift.code
    ? escapeHtml(entry.shift.code)
    : escapeHtml(
        entry.shift.start.slice(0, 2) + '-' + entry.shift.end.slice(0, 2)
      );

  const actual = escapeHtml(entry.shift.start + '-' + entry.shift.end);

  return (
    '<div class="shift-main">' +
    main +
    '</div><div class="shift-time">' +
    actual +
    '</div>'
  );
}

function getRangeHours(
  schedule: ScheduleData,
  employeeId: string,
  start: number,
  end: number
): number {
  let total = 0;

  for (let day = start; day <= end; day++) {
    const entry = getEntry(schedule, employeeId, day);
    if (entry.type === 'shift') {
      total += calculateShiftHours(entry).total;
    }
  }

  return Math.round(total * 100) / 100;
}

export function getMonthWeekRanges(
  year: number,
  month: number,
  daysInMonth: number
): WeekRange[] {
  const ranges: WeekRange[] = [];
  let start = 1;
  let index = 1;

  while (start <= daysInMonth) {
    const dayOfWeek = getDayOfWeek(year, month, start);
    const mondayBased = dayOfWeek === 0 ? 7 : dayOfWeek;
    const daysUntilSunday = 7 - mondayBased;
    const end = Math.min(daysInMonth, start + daysUntilSunday);

    ranges.push({
      key: String(index),
      start,
      end,
      label: start === end ? String(start) : start + '–' + end,
    });

    start = end + 1;
    index += 1;
  }

  return ranges;
}


export function getPrintWeekRanges(
  year: number,
  month: number
): PrintWeekRange[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const startDayOfWeek = monthStart.getDay();
  const daysFromMonday = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const firstMonday = new Date(year, month, 1 - daysFromMonday);

  const endDayOfWeek = monthEnd.getDay();
  const daysUntilSunday = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
  const lastSunday = new Date(
    monthEnd.getFullYear(),
    monthEnd.getMonth(),
    monthEnd.getDate() + daysUntilSunday
  );

  const ranges: PrintWeekRange[] = [];
  const cursor = new Date(firstMonday);

  while (cursor <= lastSunday) {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + index
      );
      return toCalendarDay(date);
    });

    const first = days[0];
    const key =
      'week:' +
      first.year +
      '-' +
      String(first.month + 1).padStart(2, '0') +
      '-' +
      String(first.day).padStart(2, '0');

    ranges.push({
      key,
      label: formatPrintWeekLabel(days),
      days,
    });

    cursor.setDate(cursor.getDate() + 7);
  }

  return ranges;
}

function buildWeekTable(
  range: WeekRange,
  departments: Department[],
  employees: Employee[],
  schedule: ScheduleData,
  year: number,
  month: number
): string {
  const dayHeaders = Array.from(
    { length: range.end - range.start + 1 },
    (_, index) => range.start + index
  );

  const headerCells = dayHeaders
    .map((day) => {
      const dayOfWeek = getDayOfWeek(year, month, day);
      const weekend = dayOfWeek === 0 || dayOfWeek === 6 ? ' weekend' : '';
      return (
        '<th class="day-head' +
        weekend +
        '"><span>' +
        DAY_NAMES_SHORT[dayOfWeek] +
        '</span><strong>' +
        day +
        '</strong></th>'
      );
    })
    .join('');

  const body = departments
    .map((department) => {
      const departmentEmployees = employees.filter(
        (employee) => employee.departmentId === department.id
      );

      const departmentRow =
        '<tr class="department-row"><td colspan="' +
        (dayHeaders.length + 2) +
        '">' +
        escapeHtml(department.name) +
        ' · ' +
        departmentEmployees.length +
        ' сотрудников</td></tr>';

      const employeeRows = departmentEmployees
        .map((employee) => {
          const cells = dayHeaders
            .map((day) => {
              const dayOfWeek = getDayOfWeek(year, month, day);
              const weekend =
                dayOfWeek === 0 || dayOfWeek === 6 ? ' weekend-cell' : '';
              return (
                '<td class="shift-cell' +
                weekend +
                '">' +
                getShiftHtml(getEntry(schedule, employee.id, day)) +
                '</td>'
              );
            })
            .join('');

          const hours = getRangeHours(
            schedule,
            employee.id,
            range.start,
            range.end
          );

          return (
            '<tr><td class="employee">' +
            escapeHtml(employee.name) +
            '</td>' +
            cells +
            '<td class="hours">' +
            hours +
            '</td></tr>'
          );
        })
        .join('');

      return departmentRow + employeeRows;
    })
    .join('');

  return (
    '<section class="week">' +
    '<div class="week-title">Неделя: ' +
    range.label +
    ' ' +
    MONTH_NAMES[month].toLowerCase() +
    ' ' +
    year +
    '</div>' +
    '<table><thead><tr><th class="employee-head">Сотрудник</th>' +
    headerCells +
    '<th class="hours-head">Часы</th></tr></thead><tbody>' +
    body +
    '</tbody></table></section>'
  );
}


function buildFullCalendarWeekTable(
  range: PrintWeekRange,
  departments: Department[],
  employees: Employee[],
  schedules: SchedulePeriodsData
): string {
  const headerCells = range.days
    .map((calendarDay) => {
      const date = new Date(
        calendarDay.year,
        calendarDay.month,
        calendarDay.day
      );
      const dayOfWeek = date.getDay();
      const weekend = dayOfWeek === 0 || dayOfWeek === 6 ? ' weekend' : '';
      return (
        '<th class="day-head' +
        weekend +
        '"><span>' +
        DAY_NAMES_SHORT[dayOfWeek] +
        '</span><strong>' +
        calendarDay.day +
        '</strong><small>' +
        MONTH_NAMES_SHORT[calendarDay.month] +
        '</small></th>'
      );
    })
    .join('');

  const body = departments
    .map((department) => {
      const departmentEmployees = employees.filter(
        (employee) => employee.departmentId === department.id
      );

      const departmentRow =
        '<tr class="department-row"><td colspan="' +
        (range.days.length + 2) +
        '">' +
        escapeHtml(department.name) +
        ' · ' +
        departmentEmployees.length +
        ' сотрудников</td></tr>';

      const employeeRows = departmentEmployees
        .map((employee) => {
          let hours = 0;

          const cells = range.days
            .map((calendarDay) => {
              const date = new Date(
                calendarDay.year,
                calendarDay.month,
                calendarDay.day
              );
              const dayOfWeek = date.getDay();
              const weekend =
                dayOfWeek === 0 || dayOfWeek === 6 ? ' weekend-cell' : '';
              const entry = getEntryForCalendarDay(
                schedules,
                employee.id,
                calendarDay
              );

              if (entry.type === 'shift') {
                hours += calculateShiftHours(entry).total;
              }

              return (
                '<td class="shift-cell' +
                weekend +
                '">' +
                getShiftHtml(entry) +
                '</td>'
              );
            })
            .join('');

          const roundedHours = Math.round(hours * 100) / 100;

          return (
            '<tr><td class="employee">' +
            escapeHtml(employee.name) +
            '</td>' +
            cells +
            '<td class="hours">' +
            roundedHours +
            '</td></tr>'
          );
        })
        .join('');

      return departmentRow + employeeRows;
    })
    .join('');

  return (
    '<section class="week">' +
    '<div class="week-title">Неделя: ' +
    escapeHtml(range.label) +
    '</div>' +
    '<table><thead><tr><th class="employee-head">Сотрудник</th>' +
    headerCells +
    '<th class="hours-head">Часы</th></tr></thead><tbody>' +
    body +
    '</tbody></table></section>'
  );
}

export function printSchedule({
  departments,
  employees,
  schedule,
  schedules,
  year,
  month,
  daysInMonth,
  rangeKey,
}: PrintScheduleOptions): void {
  const content =
    rangeKey === 'month'
      ? getMonthWeekRanges(year, month, daysInMonth)
          .map((range) =>
            buildWeekTable(
              range,
              departments,
              employees,
              schedule,
              year,
              month
            )
          )
          .join('')
      : (() => {
          const selectedRange = getPrintWeekRanges(year, month).find(
            (range) => range.key === rangeKey
          );

          return selectedRange
            ? buildFullCalendarWeekTable(
                selectedRange,
                departments,
                employees,
                schedules
              )
            : '';
        })();

  if (!content) return;

  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert('Браузер заблокировал окно печати. Разрешите всплывающие окна для сайта.');
    return;
  }

  printWindow.opener = null;

  const title =
    'График · ' + MONTH_NAMES[month] + ' ' + year;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 8mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: Arial, sans-serif;
    color: #111827;
    background: #fff;
  }

  .week {
    break-after: page;
    page-break-after: always;
  }

  .week:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .week-title {
    margin: 0 0 6mm;
    font-size: 15px;
    font-weight: 700;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 10px;
  }

  th,
  td {
    border: 1px solid #9ca3af;
    padding: 2.5mm 1.5mm;
    text-align: center;
    vertical-align: middle;
  }

  thead th {
    background: #1f2937;
    color: #fff;
    font-weight: 700;
  }

  .employee-head,
  .employee {
    width: 48mm;
    text-align: left;
  }

  .employee {
    font-weight: 700;
  }

  .hours-head,
  .hours {
    width: 18mm;
    font-weight: 700;
  }

  .day-head span {
    display: block;
    font-size: 8px;
    opacity: .75;
  }

  .day-head strong {
    display: block;
    margin-top: 1mm;
    font-size: 11px;
  }

  .day-head small {
    display: block;
    margin-top: .5mm;
    font-size: 7px;
    opacity: .7;
    font-weight: 600;
  }

  .weekend {
    background: #7f1d1d;
  }

  .weekend-cell {
    background: #fff7ed;
  }

  .department-row td {
    padding: 2.5mm;
    background: #e2e8f0;
    text-align: left;
    font-weight: 800;
    border-top: 2px solid #64748b;
  }

  .shift-main {
    font-size: 11px;
    font-weight: 800;
  }

  .shift-time {
    margin-top: 1mm;
    font-size: 8px;
    color: #64748b;
  }

  .off {
    color: #64748b;
    font-weight: 700;
  }

  .error {
    color: #b91c1c;
    font-weight: 800;
  }

  @media print {
    body {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
${content}
<script>
  window.addEventListener('load', function () {
    window.print();
  });
</script>
</body>
</html>`);
  printWindow.document.close();
}
