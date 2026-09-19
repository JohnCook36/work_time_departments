import { useTheme } from '@emotion/react';
import { Employee, EmploymentRate, ScheduleData } from './types';
import { calculateShiftHours, getWeeklyNormHours } from './utils';
import { Card, Muted, PanelTitle, Select, TinyText } from './styles';

interface WeekRangeLike {
  key: string;
  start: number;
  end: number;
  label: string;
}

interface WeeklyHoursPanelProps {
  employees: Employee[];
  schedule: ScheduleData;
  year: number;
  month: number;
  weeks: WeekRangeLike[];
  onRateChange: (employeeId: string, rate: EmploymentRate) => void;
  readOnly?: boolean;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function getEmployeeWeekFact(
  schedule: ScheduleData,
  employeeId: string,
  startDay: number,
  endDay: number
): number {
  let total = 0;

  for (let day = startDay; day <= endDay; day++) {
    const entry = schedule[employeeId]?.[day];
    if (entry?.type === 'shift') {
      total += calculateShiftHours(entry).total;
    }
  }

  return roundHours(total);
}

function formatDelta(value: number): string {
  if (Math.abs(value) < 0.01) return '0';
  return value > 0 ? '+' + roundHours(value) : String(roundHours(value));
}

export function WeeklyHoursPanel({
  employees,
  schedule,
  year,
  month,
  weeks,
  onRateChange,
  readOnly = false,
}: WeeklyHoursPanelProps) {
  const theme = useTheme();

  return (
    <Card style={{ marginTop: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px 8px' }}>
        <PanelTitle>Недельная норма</PanelTitle>
        <Muted style={{ marginTop: 4 }}>
          Факт сравнивается с нормой по ставке. Для неполной недели в начале или
          конце месяца норма считается только по будним дням, видимым в выбранном
          месяце.
        </Muted>
      </div>

      <div style={{ overflowX: 'auto', padding: '0 0 10px' }}>
        <table
          style={{
            width: 'max-content',
            minWidth: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  minWidth: 220,
                  padding: '9px 12px',
                  textAlign: 'left',
                  background: theme.colors.department,
                  borderTop: '1px solid ' + theme.colors.border,
                  borderBottom: '1px solid ' + theme.colors.border,
                  borderRight: '1px solid ' + theme.colors.border,
                }}
              >
                Сотрудник
              </th>

              <th
                style={{
                  minWidth: 84,
                  padding: '9px 8px',
                  background: theme.colors.department,
                  borderTop: '1px solid ' + theme.colors.border,
                  borderBottom: '1px solid ' + theme.colors.border,
                  borderRight: '1px solid ' + theme.colors.border,
                }}
              >
                Ставка
              </th>

              {weeks.map((week) => (
                <th
                  key={week.key}
                  style={{
                    minWidth: 132,
                    padding: '9px 8px',
                    background: theme.colors.department,
                    borderTop: '1px solid ' + theme.colors.border,
                    borderBottom: '1px solid ' + theme.colors.border,
                    borderRight: '1px solid ' + theme.colors.border,
                  }}
                >
                  Неделя {week.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {employees.map((employee, index) => {
              const rate = employee.employmentRate || 1;

              return (
                <tr
                  key={employee.id}
                  style={{
                    background:
                      index % 2 === 1
                        ? theme.mode === 'dark'
                          ? '#0f1726'
                          : '#fafafa'
                        : theme.colors.surfaceElevated,
                  }}
                >
                  <td
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      minWidth: 220,
                      maxWidth: 220,
                      padding: '8px 12px',
                      fontWeight: 700,
                      background: 'inherit',
                      borderBottom: '1px solid ' + theme.colors.border,
                      borderRight: '1px solid ' + theme.colors.border,
                      boxShadow: '3px 0 8px rgba(15,23,42,.08)',
                    }}
                  >
                    {employee.name}
                  </td>

                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'center',
                      borderBottom: '1px solid ' + theme.colors.border,
                      borderRight: '1px solid ' + theme.colors.border,
                    }}
                  >
                    {readOnly ? (
                      <strong>{rate}</strong>
                    ) : (
                      <Select
                        value={rate}
                        onChange={(event) =>
                          onRateChange(
                            employee.id,
                            Number(event.target.value) as EmploymentRate
                          )
                        }
                        title="Ставка сотрудника"
                        style={{
                          minWidth: 68,
                          height: 30,
                          padding: '0 7px',
                          fontSize: 11,
                        }}
                      >
                        <option value={1}>1.0</option>
                        <option value={0.75}>0.75</option>
                        <option value={0.5}>0.5</option>
                      </Select>
                    )}
                  </td>

                  {weeks.map((week) => {
                    const fact = getEmployeeWeekFact(
                      schedule,
                      employee.id,
                      week.start,
                      week.end
                    );
                    const norm = getWeeklyNormHours(
                      year,
                      month,
                      week.start,
                      week.end,
                      rate
                    );
                    const delta = roundHours(fact - norm);
                    const isBalanced = Math.abs(delta) < 0.01;
                    const deltaColor = isBalanced
                      ? theme.colors.textMuted
                      : delta > 0
                        ? theme.mode === 'dark'
                          ? '#6ee7b7'
                          : '#047857'
                        : theme.mode === 'dark'
                          ? '#fbbf24'
                          : '#b45309';

                    return (
                      <td
                        key={week.key}
                        style={{
                          minWidth: 132,
                          padding: '7px 9px',
                          textAlign: 'center',
                          borderBottom: '1px solid ' + theme.colors.border,
                          borderRight: '1px solid ' + theme.colors.border,
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>
                          {fact} / {norm}
                        </div>
                        <TinyText style={{ marginTop: 2 }}>
                          факт / норма
                        </TinyText>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 11,
                            fontWeight: 800,
                            color: deltaColor,
                          }}
                        >
                          {formatDelta(delta)} ч
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
