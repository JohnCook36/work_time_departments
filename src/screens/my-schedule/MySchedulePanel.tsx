import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@emotion/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CalendarDays,
  Clock3,
  RefreshCw,
  X,
} from 'lucide-react';

import { IconButton } from '../../theme/styles';
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
  const theme = useTheme();
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
            <motion.div
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
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 11900,
                display: 'flex',
                justifyContent: 'flex-end',
                background: theme.colors.overlay,
              }}
            >
              <motion.aside
                initial={reduceMotion ? false : { opacity: 0, x: 36 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 36 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  width: 'min(500px, 100%)',
                  height: '100%',
                  overflowY: 'auto',
                  padding: 20,
                  background: theme.colors.surfaceElevated,
                  color: theme.colors.text,
                  borderLeft: '1px solid ' + theme.colors.border,
                  boxShadow: theme.shadows.drawer,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 800,
                        fontSize: 18,
                      }}
                    >
                      <CalendarDays size={20} />
                      Мои смены
                    </div>
                    <div
                      style={{
                        marginTop: 5,
                        color: theme.colors.textMuted,
                        fontSize: 13,
                      }}
                    >
                      {MONTH_NAMES[monthIndex]} {year}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
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
                  </div>
                </div>

                {error && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 10,
                      borderRadius: 10,
                      background: theme.colors.dangerSoft,
                      color: theme.colors.danger,
                      fontSize: 13,
                    }}
                  >
                    {error}
                  </div>
                )}

                {loading && !data ? (
                  <div
                    style={{
                      padding: '28px 0',
                      textAlign: 'center',
                      color: theme.colors.textMuted,
                    }}
                  >
                    Загружаем ваши смены…
                  </div>
                ) : data ? (
                  <>
                    <div
                      style={{
                        marginTop: 18,
                        padding: 14,
                        borderRadius: 14,
                        border: '1px solid ' + theme.colors.border,
                        background: theme.colors.surface,
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        {data.employee.displayName}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          color: theme.colors.textMuted,
                          fontSize: 12,
                        }}
                      >
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
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: 8,
                          marginTop: 12,
                        }}
                      >
                        {[
                          ['День', totals.day],
                          ['Ночь', totals.night],
                          ['Итого', totals.total],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            style={{
                              padding: 10,
                              borderRadius: 10,
                              background: theme.colors.offSoft,
                              textAlign: 'center',
                            }}
                          >
                            <div
                              style={{
                                color: theme.colors.textMuted,
                                fontSize: 11,
                              }}
                            >
                              {label}
                            </div>
                            <div
                              style={{
                                marginTop: 3,
                                fontWeight: 800,
                                fontSize: 16,
                              }}
                            >
                              {value} ч
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      {visibleShifts.length === 0 ? (
                        <div
                          style={{
                            padding: 22,
                            borderRadius: 14,
                            border: '1px dashed ' + theme.colors.border,
                            textAlign: 'center',
                            color: theme.colors.textMuted,
                          }}
                        >
                          На этот месяц смен пока нет.
                        </div>
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
                            <motion.div
                              layout={!reduceMotion}
                              key={shift.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '58px 1fr auto',
                                gap: 10,
                                alignItems: 'center',
                                padding: 12,
                                borderRadius: 12,
                                border:
                                  '1px solid ' + theme.colors.border,
                                background: theme.colors.surface,
                              }}
                            >
                              <div
                                style={{
                                  textAlign: 'center',
                                  lineHeight: 1.1,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 18,
                                    fontWeight: 900,
                                  }}
                                >
                                  {day}
                                </div>
                                <div
                                  style={{
                                    marginTop: 3,
                                    color: theme.colors.textMuted,
                                    fontSize: 11,
                                  }}
                                >
                                  {DAY_NAMES_SHORT[date.getDay()]}
                                </div>
                              </div>

                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 800,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {shiftTitle(shift)}
                                  {'inherited' in shift && shift.inherited && (
                                    <span
                                      style={{
                                        marginLeft: 7,
                                        color: theme.colors.textMuted,
                                        fontSize: 10,
                                        fontWeight: 700,
                                      }}
                                    >
                                      по графику 5/2
                                    </span>
                                  )}
                                </div>
                                {!shift.isOff &&
                                  shift.startTime &&
                                  shift.endTime && (
                                    <div
                                      style={{
                                        marginTop: 3,
                                        color: theme.colors.textMuted,
                                        fontSize: 11,
                                      }}
                                    >
                                      Д {hours.day} • Н {hours.night}
                                    </div>
                                  )}
                              </div>

                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  color: theme.colors.textMuted,
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                <Clock3 size={14} />
                                {hours.total} ч
                              </div>
                            </motion.div>
                          );
                        })
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        color: theme.colors.textMuted,
                        fontSize: 11,
                        lineHeight: 1.45,
                      }}
                    >
                      Это персональное представление серверного расписания.
                      Предложения обмена и подмены будут подключены к этим
                      реальным сменам отдельным workflow с подтверждением
                      руководителя.
                    </div>
                  </>
                ) : null}
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
