import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';

import {
  ApiError,
  MyScheduleResponse,
  MyScheduleShift,
  getMySchedule,
  logout,
} from '../../api/auth';
import { useAuthUser } from '../../auth/AuthContext';
import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import { useAuthSession } from '../../auth/AuthSessionProvider';
import {
  buildVisibleShifts,
  toShiftEntry,
} from '../../domain/schedule/personalSchedule';
import { calculateShiftHours } from '../../domain/schedule/shiftHours';
import { Container, IconButton, Page } from '../../theme/styles';
import { DAY_NAMES_SHORT, MONTH_NAMES } from '../../utils/calendar';
import { useAppTheme } from '../../theme/AppThemeProvider';
import {
  EmployeeMeta,
  EmployeeName,
  EmployeeSummary,
  EmptySchedule,
  InheritedLabel,
  LogoutButton,
  PeriodLabel,
  PeriodNavigation,
  ScheduleCard,
  ScheduleError,
  ScheduleFooterNote,
  ScheduleHeaderActions,
  ScheduleLoading,
  SchedulePageHeader,
  SchedulePageHeading,
  SchedulePageSubtitle,
  SchedulePageTitle,
  ShiftBody,
  ShiftDate,
  ShiftDayName,
  ShiftDayNumber,
  ShiftHours,
  ShiftList,
  ShiftMeta,
  ShiftRow,
  ShiftTitle,
  ThemeToggleButton,
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

export function MyScheduleScreen() {
  const user = useAuthUser();
  const { refresh: refreshSession } = useAuthSession();
  const initialNow = useMemo(() => new Date(), []);
  const [year, setYear] = useState(initialNow.getFullYear());
  const [monthIndex, setMonthIndex] = useState(initialNow.getMonth());
  const [data, setData] = useState<MyScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { themeMode, toggleTheme } = useAppTheme();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setData(await getMySchedule(year, monthIndex + 1));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await refreshSession();
        return;
      }

      setData(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось загрузить персональный график',
      );
    } finally {
      setLoading(false);
    }
  }, [monthIndex, refreshSession, year]);

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
    const next = new Date(year, monthIndex + delta, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
  };

  const handleLogout = async () => {
    await logout();
    await refreshSession();
  };

  return (
    <Page>
        <Container>
          <SchedulePageHeader>
            <SchedulePageHeading>
              <SchedulePageTitle>Мои смены</SchedulePageTitle>
              <SchedulePageSubtitle>
                Персональный график • {user.employee?.displayName}
              </SchedulePageSubtitle>
            </SchedulePageHeading>

            <ScheduleHeaderActions>
              <ThemeToggleButton
                type="button"
                onClick={toggleTheme}
                title={
                  themeMode === 'light'
                    ? 'Включить тёмную тему'
                    : 'Включить светлую тему'
                }
              >
                {themeMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </ThemeToggleButton>
              <LogoutButton type="button" onClick={() => void handleLogout()}>
                <LogOut size={15} />
                Выйти
              </LogoutButton>
            </ScheduleHeaderActions>
          </SchedulePageHeader>

          <AppSectionNav />

          <ScheduleCard>
            <PeriodNavigation>
              <IconButton
                type="button"
                onClick={() => changeMonth(-1)}
                title="Предыдущий месяц"
              >
                <ChevronLeft size={19} />
              </IconButton>
              <PeriodLabel>
                {MONTH_NAMES[monthIndex]} {year}
              </PeriodLabel>
              <IconButton
                type="button"
                onClick={() => changeMonth(1)}
                title="Следующий месяц"
              >
                <ChevronRight size={19} />
              </IconButton>
              <IconButton
                type="button"
                onClick={() => void load()}
                title="Обновить"
              >
                <RefreshCw size={17} />
              </IconButton>
            </PeriodNavigation>

            {error && <ScheduleError role="alert">{error}</ScheduleError>}

            {loading && !data ? (
              <ScheduleLoading>Загружаем ваши смены…</ScheduleLoading>
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
                            <ShiftDayName>
                              {DAY_NAMES_SHORT[date.getDay()]}
                            </ShiftDayName>
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

                <ScheduleFooterNote>
                  Здесь отображаются только ваши смены. Данные других сотрудников
                  и инструменты управления общим графиком недоступны на этой
                  странице.
                </ScheduleFooterNote>
              </>
            ) : null}
          </ScheduleCard>
        </Container>
    </Page>
  );
}

export default MyScheduleScreen;
