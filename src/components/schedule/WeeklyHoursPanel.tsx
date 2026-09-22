import { Employee, EmploymentRate, ScheduleData } from '../../domain/models';
import { calculateShiftHours, getWeeklyNormHours } from '../../domain/schedule/shiftHours';
import { PanelTitle } from '../../theme/styles';
import {
  EmployeeCell,
  EmployeeHeaderCell,
  RateCell,
  RateHeaderCell,
  RateSelect,
  WeekCell,
  WeekHeaderCell,
  WeeklyDelta,
  WeeklyFact,
  WeeklyHint,
  WeeklyHoursCard,
  WeeklyHoursDescription,
  WeeklyHoursHeader,
  WeeklyHoursScroll,
  WeeklyHoursTable,
  WeeklyRow,
} from './WeeklyHoursPanel.styles';

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
  return (
    <WeeklyHoursCard>
      <WeeklyHoursHeader>
        <PanelTitle>Недельная норма</PanelTitle>
        <WeeklyHoursDescription>
          Факт сравнивается с нормой по ставке. Для неполной недели в начале или
          конце месяца норма считается только по будним дням, видимым в выбранном
          месяце.
        </WeeklyHoursDescription>
      </WeeklyHoursHeader>

      <WeeklyHoursScroll>
        <WeeklyHoursTable>
          <thead>
            <tr>
              <EmployeeHeaderCell>
                Сотрудник
              </EmployeeHeaderCell>

              <RateHeaderCell>
                Ставка
              </RateHeaderCell>

              {weeks.map((week) => (
                <WeekHeaderCell key={week.key}>
                  Неделя {week.label}
                </WeekHeaderCell>
              ))}
            </tr>
          </thead>

          <tbody>
            {employees.map((employee, index) => {
              const rate = employee.employmentRate || 1;

              return (
                <WeeklyRow key={employee.id} $odd={index % 2 === 1}>
                  <EmployeeCell>
                    {employee.name}
                  </EmployeeCell>

                  <RateCell>
                    {readOnly ? (
                      <strong>{rate}</strong>
                    ) : (
                      <RateSelect
                        value={rate}
                        onChange={(event) =>
                          onRateChange(
                            employee.id,
                            Number(event.target.value) as EmploymentRate
                          )
                        }
                        title="Ставка сотрудника"
                      >
                        <option value={1}>1.0</option>
                        <option value={0.75}>0.75</option>
                        <option value={0.5}>0.5</option>
                      </RateSelect>
                    )}
                  </RateCell>

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
                    const deltaTone = isBalanced
                      ? 'balanced'
                      : delta > 0
                        ? 'positive'
                        : 'negative';

                    return (
                      <WeekCell key={week.key}>
                        <WeeklyFact>
                          {fact} / {norm}
                        </WeeklyFact>
                        <WeeklyHint>факт / норма</WeeklyHint>
                        <WeeklyDelta $tone={deltaTone}>
                          {formatDelta(delta)} ч
                        </WeeklyDelta>
                      </WeekCell>
                    );
                  })}
                </WeeklyRow>
              );
            })}
          </tbody>
        </WeeklyHoursTable>
      </WeeklyHoursScroll>
    </WeeklyHoursCard>
  );
}
