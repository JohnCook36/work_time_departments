import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, RefreshCw } from 'lucide-react';

import { getMySchedule, MyScheduleResponse, MyScheduleShift } from '../../api/auth';
import { toShiftEntry, buildVisibleShifts } from '../../domain/schedule/personalSchedule';
import { calculateShiftHours } from '../../domain/schedule/shiftHours';
import { DAY_NAMES_SHORT, MONTH_NAMES } from '../../utils/calendar';
import {
  EmptySchedule,
  EmployeeMeta,
  EmployeeName,
  EmployeeSummary,
  InheritedLabel,
  MonthControlButton,
  MonthControls,
  MonthLabel,
  MyScheduleContent,
  MyScheduleHeaderActions,
  MyScheduleHeaderCard,
  MySchedulePageShell,
  MyScheduleSubtitle,
  MyScheduleTitle,
  MyScheduleTitleBlock,
  MyScheduleTopRow,
  RefreshButton,
  ScheduleFooter,
  ScheduleSection,
  SectionError,
  SectionLoading,
  ShiftBody,
  ShiftDate,
  ShiftDayName,
  ShiftDayNumber,
  ShiftHours,
  ShiftList,
  ShiftMeta,
  ShiftRow,
  ShiftTitle,
  TotalCard,
  TotalLabel,
  TotalsGrid,
  TotalValue,
} from './MyScheduleScreen.styles';

function shiftTitle(shift: MyScheduleShift): string {
  if (shift.isOff) return 'OFF';
  if (!shift.startTime || !shift.endTime) return 'Смена без времени';

  return [shift.code, shift.startTime + '–' + shift.endTime]
    .filter(Boolean)
    .join(' ');
}

function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

function moveMonth(year: number, monthIndex: number, delta: number) {
  const next = new Date(year, monthIndex + delta, 1);
  return { year: next.getFullYear(), monthIndex: next.getMonth() };
}

export function MyScheduleScreen() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [data, setData] = useState<MyScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setData(await getMySchedule(year, monthIndex + 1));
    } catch (requestError) {
      setData(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось загрузить персональный график',
      );
    } finally {
      setLoading(false);
    }
  }, [monthIndex, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleShifts = useMemo(
    () => (data ? buildVisibleShifts(data) : []),
    [data],
  );

  const totals = useMemo(
    () =>
      visibleShifts.reduce(
        (acc, shift) => {
          const hours = calculateShiftHours(toShiftEntry(shift));
          return {
            day: Math.round((acc.day + hours.day) * 100) / 100,
            night: Math.round((acc.night + hours.night) * 100) / 100,
            total: Math.round((acc.total + hours.total) * 100) / 100,
          };
        },
        { day: 0, night: 0, total: 0 },
      ),
    [visibleShifts],
  );

  const changeMonth = (delta: number) => {
    const next = moveMonth(year, monthIndex, delta);
    setYear(next.year);
    setMonthIndex(next.monthIndex);
  };

  return (
    <MySchedulePageShell>
      <MyScheduleContent>
        <MyScheduleHeaderCard>
          <MyScheduleTopRow>
            <MyScheduleTitleBlock>
              <MyScheduleTitle>Мои смены</MyScheduleTitle>
              <MyScheduleSubtitle>
                Только ваше персональное расписание и ваши часы.
              </MyScheduleSubtitle>
            </MyScheduleTitleBlock>

            <MyScheduleHeaderActions>
              <RefreshButton
                type="button"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw size={16} />
                Обновить
              </RefreshButton>
            </MyScheduleHeaderActions>
          </MyScheduleTopRow>

          <MonthControls>
            <MonthControlButton
              type="button"
              title="Предыдущий месяц"
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft size={18} />
            </MonthControlButton>

            <MonthLabel>
              {MONTH_NAMES[monthIndex]} {year}
            </MonthLabel>

            <MonthControlButton
              type="button"
              title="Следующий месяц"
              onClick={() => changeMonth(1)}
            >
              <ChevronRight size={18} />
            </MonthControlButton>
          </MonthControls>
        </MyScheduleHeaderCard>

        <ScheduleSection>
          {loading && !data ? (
            <SectionLoading>Загружаем ваши смены…</SectionLoading>
          ) : error ? (
            <SectionError>{error}</SectionError>
          ) : data ? (
            <>
              <EmployeeSummary>
                <EmployeeName>{data.employee.displayName}</EmployeeName>
                <EmployeeMeta>
                  {data.employee.department.name}
                  {' • '}
                  ставка {data.employee.employmentRate}
                  {' • '}
                  {data.employee.scheduleMode === 'FIXED_WEEKDAYS' &&
                  data.employee.fixedStartTime &&
                  data.employee.fixedEndTime
                    ? '5/2 ' +
                      data.employee.fixedStartTime +
                      '–' +
                      data.employee.fixedEndTime
                    : 'плавающий график'}
                </EmployeeMeta>

                <TotalsGrid>
                  {[
                    ['День', totals.day],
                    ['Ночь', totals.night],
                    ['Итого', totals.total],
                  ].map(([label, value]) => (
                    <TotalCard key={String(label)}>
                      <TotalLabel>{label}</TotalLabel>
                      <TotalValue>{value} ч</TotalValue>
                    </TotalCard>
                  ))}
                </TotalsGrid>
              </EmployeeSummary>

              <ShiftList>
                {visibleShifts.length === 0 ? (
                  <EmptySchedule>На этот месяц смен пока нет.</EmptySchedule>
                ) : (
                  visibleShifts.map((shift) => {
                    const day = dayOfMonth(shift.date);
                    const date = new Date(year, monthIndex, day);
                    const hours = calculateShiftHours(toShiftEntry(shift));

                    return (
                      <ShiftRow key={shift.id}>
                        <ShiftDate>
                          <ShiftDayNumber>{day}</ShiftDayNumber>
                          <ShiftDayName>{DAY_NAMES_SHORT[date.getDay()]}</ShiftDayName>
                        </ShiftDate>

                        <ShiftBody>
                          <ShiftTitle>
                            {shiftTitle(shift)}
                            {'inherited' in shift && shift.inherited && (
                              <InheritedLabel>по графику 5/2</InheritedLabel>
                            )}
                          </ShiftTitle>
                          {!shift.isOff &&
                            shift.startTime &&
                            shift.endTime && (
                              <ShiftMeta>
                                Д {hours.day} • Н {hours.night}
                              </ShiftMeta>
                            )}
                        </ShiftBody>

                        <ShiftHours>
                          <Clock3 size={14} />
                          {hours.total} ч
                        </ShiftHours>
                      </ShiftRow>
                    );
                  })
                )}
              </ShiftList>

              <ScheduleFooter>
                Персональный экран получает только ваш server-backed schedule.
                Общий график и управление сотрудниками здесь недоступны.
              </ScheduleFooter>
            </>
          ) : null}
        </ScheduleSection>
      </MyScheduleContent>
    </MySchedulePageShell>
  );
}
