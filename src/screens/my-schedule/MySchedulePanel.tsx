import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  CalendarDays,
  Clock3,
  RefreshCw,
  X,
} from 'lucide-react';

import { IconButton } from '../../theme/styles';
import {
  EmptySchedule,
  EmployeeMeta,
  EmployeeName,
  EmployeeSummary,
  InheritedLabel,
  ScheduleDrawer,
  ScheduleError,
  ScheduleFooterNote,
  ScheduleHeader,
  ScheduleHeaderActions,
  ScheduleLoading,
  ScheduleOverlay,
  SchedulePeriod,
  ScheduleTitle,
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
} from './MySchedulePanel.styles';
import { toShiftEntry, buildVisibleShifts } from '../../domain/schedule/personalSchedule';
import { calculateShiftHours } from '../../domain/schedule/shiftHours';
import { DAY_NAMES_SHORT, MONTH_NAMES } from '../../utils/calendar';
import {
  ApiError,
  MyScheduleResponse,
  MyScheduleShift,
  getMySchedule,
} from '../../api/auth';

interface MySchedulePanelProps {
  year: number;
  monthIndex: number;
}

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

export function MySchedulePanel({
  year,
  monthIndex,
}: MySchedulePanelProps) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MyScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getMySchedule(year, monthIndex + 1);
      setData(result);
      setAvailable(true);
    } catch (requestError) {
      if (
        requestError instanceof ApiError &&
        (requestError.status === 401 ||
          requestError.status === 404 ||
          requestError.status === 409)
      ) {
        setAvailable(false);
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Не удалось загрузить персональный график',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [monthIndex, year]);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [load, open]);

  useEffect(() => {
    setData(null);
    setError(null);
  }, [year, monthIndex]);

  const visibleShifts = useMemo(
    () => (data ? buildVisibleShifts(data) : []),
    [data],
  );

  const totals = useMemo(() => {
    if (!data) {
      return { day: 0, night: 0, total: 0 };
    }

    return visibleShifts.reduce(
      (acc, shift) => {
        const hours = calculateShiftHours(toShiftEntry(shift));
        return {
          day: Math.round((acc.day + hours.day) * 100) / 100,
          night: Math.round((acc.night + hours.night) * 100) / 100,
          total: Math.round((acc.total + hours.total) * 100) / 100,
        };
      },
      { day: 0, night: 0, total: 0 },
    );
  }, [data, visibleShifts]);

  if (!available && !open) {
    return null;
  }

  return (
    <>
      <IconButton
        type="button"
        title="Мои смены"
        onClick={() => setOpen(true)}
      >
        <CalendarDays size={18} />
      </IconButton>

      {createPortal(
        <AnimatePresence>
          {open && (
            <ScheduleOverlay
              key="my-schedule-overlay"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.16 }}
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) {
                  setOpen(false);
                }
              }}
            >
              <ScheduleDrawer
                initial={reduceMotion ? false : { opacity: 0, x: 36 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 36 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <ScheduleHeader>
                  <div>
                    <ScheduleTitle>
                      <CalendarDays size={20} />
                      Мои смены
                    </ScheduleTitle>
                    <SchedulePeriod>
                      {MONTH_NAMES[monthIndex]} {year}
                    </SchedulePeriod>
                  </div>

                  <ScheduleHeaderActions>
                    <IconButton
                      type="button"
                      title="Обновить"
                      onClick={() => void load()}
                    >
                      <RefreshCw size={17} />
                    </IconButton>
                    <IconButton
                      type="button"
                      title="Закрыть"
                      onClick={() => setOpen(false)}
                    >
                      <X size={18} />
                    </IconButton>
                  </ScheduleHeaderActions>
                </ScheduleHeader>

                {error && (
                  <ScheduleError>{error}</ScheduleError>
                )}

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
                          const date = new Date(
                            year,
                            monthIndex,
                            day,
                          );
                          const entry = toShiftEntry(shift);
                          const hours = calculateShiftHours(entry);

                          return (
                            <ShiftRow
                              layout={!reduceMotion}
                              key={shift.id}
                            >
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
                                    <ShiftMeta>Д {hours.day} • Н {hours.night}</ShiftMeta>
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
                      Это персональное представление серверного расписания.
                      Предложения обмена и подмены будут подключены к этим
                      реальным сменам отдельным workflow с подтверждением
                      руководителя.
                    </ScheduleFooterNote>
                  </>
                ) : null}
              </ScheduleDrawer>
            </ScheduleOverlay>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
