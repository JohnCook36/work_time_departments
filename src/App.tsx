import { useState, useCallback, useMemo, useEffect } from 'react';
import { Employee, ScheduleData, ShiftEntry } from './types';
import {
  validateShiftInput,
  calculateShiftHours,
  getDaysInMonth,
  getDayOfWeek,
  MONTH_NAMES,
  DAY_NAMES_SHORT
} from './utils';

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

const DEFAULT_EMPLOYEES: Employee[] = [
  { id: '1', name: 'Иванова А.М.' },
  { id: '2', name: 'Петров С.В.' },
  { id: '3', name: 'Сидорова Е.К.' },
  { id: '4', name: 'Козлов Д.И.' },
];

const STORAGE_KEY = 'hotel-shift-planner';

function loadFromStorage(): { employees: Employee[]; schedule: ScheduleData } | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch { /* ignore */ }
  return null;
}

function saveToStorage(employees: Employee[], schedule: ScheduleData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ employees, schedule }));
  } catch { /* ignore */ }
}

function App() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  
  const stored = useMemo(() => loadFromStorage(), []);
  const [employees, setEmployees] = useState<Employee[]>(stored?.employees || DEFAULT_EMPLOYEES);
  const [schedule, setSchedule] = useState<ScheduleData>(stored?.schedule || {});
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [editingCell, setEditingCell] = useState<{ empId: string; day: number } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const daysInMonth = getDaysInMonth(year, month);

  // Save to localStorage whenever data changes
  useEffect(() => {
    saveToStorage(employees, schedule);
  }, [employees, schedule]);

  // Get or create entry for a cell
  const getEntry = useCallback((empId: string, day: number): ShiftEntry => {
    return schedule[empId]?.[day] || { type: 'empty' };
  }, [schedule]);

  // Update a cell
  const updateCell = useCallback((empId: string, day: number, value: string) => {
    const entry = validateShiftInput(value);
    setSchedule(prev => ({
      ...prev,
      [empId]: {
        ...(prev[empId] || {}),
        [day]: entry
      }
    }));
  }, []);

  // Calculate totals for an employee
  const getEmployeeTotals = useCallback((empId: string) => {
    let totalDay = 0;
    let totalNight = 0;
    let totalHours = 0;
    let workDays = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const entry = getEntry(empId, day);
      if (entry.type === 'shift') {
        const hours = calculateShiftHours(entry);
        totalDay += hours.day;
        totalNight += hours.night;
        totalHours += hours.total;
        workDays++;
      }
    }

    return {
      day: Math.round(totalDay * 100) / 100,
      night: Math.round(totalNight * 100) / 100,
      total: Math.round(totalHours * 100) / 100,
      workDays
    };
  }, [daysInMonth, getEntry]);

  // Add employee
  const addEmployee = () => {
    if (!newEmployeeName.trim()) return;
    setEmployees(prev => [...prev, { id: generateId(), name: newEmployeeName.trim() }]);
    setNewEmployeeName('');
  };

  // Remove employee
  const removeEmployee = (id: string) => {
    if (!confirm('Удалить сотрудника и все его смены?')) return;
    setEmployees(prev => prev.filter(e => e.id !== id));
    setSchedule(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Navigate months
  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Cell display value
  const getDisplayValue = (entry: ShiftEntry): string => {
    if (entry.type === 'shift' && entry.shift) return `${entry.shift.start}-${entry.shift.end}`;
    if (entry.type === 'off') return 'OFF';
    return '';
  };

  // Grand totals
  const grandTotals = useMemo(() => {
    let day = 0, night = 0, total = 0;
    employees.forEach(emp => {
      const t = getEmployeeTotals(emp.id);
      day += t.day;
      night += t.night;
      total += t.total;
    });
    return { day: Math.round(day * 100) / 100, night: Math.round(night * 100) / 100, total: Math.round(total * 100) / 100 };
  }, [employees, getEmployeeTotals]);

  // Quick fill: set all empty cells to OFF
  const fillOffAll = () => {
    if (!confirm('Заполнить все пустые ячейки как OFF (выходной)?')) return;
    setSchedule(prev => {
      const next = { ...prev };
      employees.forEach(emp => {
        if (!next[emp.id]) next[emp.id] = {};
        for (let day = 1; day <= daysInMonth; day++) {
          if (!next[emp.id][day] || next[emp.id][day].type === 'empty') {
            next[emp.id] = { ...next[emp.id], [day]: { type: 'off' } };
          }
        }
      });
      return next;
    });
  };

  // Clear all
  const clearAll = () => {
    if (!confirm('Очистить все смены за текущий месяц?')) return;
    setSchedule({});
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-3 md:p-6">
      <div className="max-w-full mx-auto">
        {/* Header */}
        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
                <span className="text-2xl md:text-3xl">🏨</span>
                <span>Планировщик смен</span>
              </h1>
              <p className="text-gray-500 text-xs md:text-sm mt-1">Расписание сотрудников отеля • Приватный доступ</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Предыдущий месяц">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-base md:text-lg font-semibold text-gray-700 min-w-[160px] text-center select-none">
                {MONTH_NAMES[month]} {year}
              </span>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Следующий месяц">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="ml-2 p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-500"
                title="Справка"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Help panel */}
        {showHelp && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 md:mb-6 animate-fade-in">
            <div className="flex justify-between items-start">
              <h3 className="font-semibold text-blue-800 mb-2">📋 Как пользоваться:</h3>
              <button onClick={() => setShowHelp(false)} className="text-blue-400 hover:text-blue-600">✕</button>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-blue-700">
              <div>
                <p className="font-medium mb-1">Формат ввода:</p>
                <ul className="space-y-1">
                  <li>• Смена: <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">08:00-16:00</code></li>
                  <li>• Выходной: <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">OFF</code></li>
                  <li>• Ночная смена: <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">22:00-06:00</code></li>
                  <li>• Пустое поле — не заполнено</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Расчёт часов:</p>
                <ul className="space-y-1">
                  <li>☀️ Дневные: 06:00 – 22:00</li>
                  <li>🌙 Ночные: 22:00 – 06:00</li>
                  <li>• Ошибки подсвечиваются красным</li>
                  <li>• Данные сохраняются автоматически</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-3 md:p-4 mb-4 md:mb-6">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <input
              type="text"
              value={newEmployeeName}
              onChange={e => setNewEmployeeName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEmployee()}
              placeholder="ФИО нового сотрудника..."
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 flex-1 min-w-[180px] text-sm"
            />
            <button
              onClick={addEmployee}
              className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm whitespace-nowrap"
            >
              + Сотрудник
            </button>
            <div className="h-6 w-px bg-gray-200 hidden md:block"></div>
            <button
              onClick={fillOffAll}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
              title="Заполнить пустые ячейки как выходные"
            >
              📋 OFF все
            </button>
            <button
              onClick={clearAll}
              className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm whitespace-nowrap"
            >
              🗑 Очистить
            </button>
          </div>
        </div>

        {/* Schedule Table */}
        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs md:text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-gray-800 to-gray-700 text-white">
                  <th className="sticky left-0 bg-gray-800 z-10 px-2 md:px-3 py-2 text-left font-medium min-w-[140px] md:min-w-[170px] border-r border-gray-600">
                    Сотрудник
                  </th>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                    const dow = getDayOfWeek(year, month, day);
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <th
                        key={day}
                        className={`px-0.5 py-1 text-center font-medium min-w-[52px] md:min-w-[60px] ${
                          isWeekend ? 'bg-red-900/30' : ''
                        }`}
                      >
                        <div className="text-[10px] opacity-60">{DAY_NAMES_SHORT[dow]}</div>
                        <div className="text-xs md:text-sm">{day}</div>
                      </th>
                    );
                  })}
                  <th className="px-1 md:px-2 py-2 text-center font-medium bg-emerald-800/50 min-w-[55px] md:min-w-[65px] border-l border-gray-600">
                    <div className="text-[10px] opacity-70">☀️</div>
                    <div>Днев.</div>
                  </th>
                  <th className="px-1 md:px-2 py-2 text-center font-medium bg-indigo-800/50 min-w-[55px] md:min-w-[65px]">
                    <div className="text-[10px] opacity-70">🌙</div>
                    <div>Ночн.</div>
                  </th>
                  <th className="px-1 md:px-2 py-2 text-center font-medium bg-blue-800/50 min-w-[55px] md:min-w-[65px]">
                    <div className="text-[10px] opacity-70">Σ</div>
                    <div>Итого</div>
                  </th>
                  <th className="px-1 md:px-2 py-2 text-center font-medium min-w-[40px] md:min-w-[50px]">
                    <div className="text-[10px] opacity-70">📅</div>
                    <div>Дней</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, idx) => {
                  const totals = getEmployeeTotals(emp.id);
                  return (
                    <tr key={emp.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30 transition-colors`}>
                      <td className="sticky left-0 z-10 px-2 md:px-3 py-1.5 border-b border-r border-gray-200 font-medium bg-inherit backdrop-blur-sm">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-xs md:text-sm">{emp.name}</span>
                          <button
                            onClick={() => removeEmployee(emp.id)}
                            className="text-red-300 hover:text-red-500 text-xs flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-red-50"
                            title="Удалить"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                        const entry = getEntry(emp.id, day);
                        const dow = getDayOfWeek(year, month, day);
                        const isWeekend = dow === 0 || dow === 6;
                        const isEditing = editingCell?.empId === emp.id && editingCell?.day === day;

                        let cellBg = '';
                        if (entry.type === 'error') cellBg = 'bg-red-100';
                        else if (entry.type === 'off') cellBg = 'bg-gray-100';
                        else if (entry.type === 'shift') {
                          // Check if it's a night shift
                          const hours = calculateShiftHours(entry);
                          if (hours.night > 0 && hours.day === 0) cellBg = 'bg-indigo-50';
                          else if (hours.night > 0) cellBg = 'bg-amber-50';
                          else cellBg = 'bg-emerald-50';
                        }

                        return (
                          <td
                            key={day}
                            className={`px-px py-px border-b border-r border-gray-100 text-center ${
                              isWeekend && entry.type === 'empty' ? 'bg-red-50/30' : ''
                            } ${cellBg}`}
                            onClick={() => setEditingCell({ empId: emp.id, day })}
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                defaultValue={getDisplayValue(entry)}
                                autoFocus
                                className="w-full px-1 py-0.5 text-center text-xs border border-blue-400 rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                onBlur={(e) => {
                                  updateCell(emp.id, day, e.target.value);
                                  setEditingCell(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    updateCell(emp.id, day, (e.target as HTMLInputElement).value);
                                    setEditingCell(null);
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingCell(null);
                                  }
                                  // Tab to next cell
                                  if (e.key === 'Tab') {
                                    e.preventDefault();
                                    updateCell(emp.id, day, (e.target as HTMLInputElement).value);
                                    if (day < daysInMonth) {
                                      setEditingCell({ empId: emp.id, day: day + 1 });
                                    }
                                  }
                                }}
                              />
                            ) : (
                              <div
                                className={`px-0.5 py-0.5 text-[10px] md:text-xs rounded-sm cursor-pointer min-h-[22px] flex items-center justify-center transition-all ${
                                  entry.type === 'error' ? 'text-red-600 font-bold' :
                                  entry.type === 'off' ? 'text-gray-400 font-medium' :
                                  entry.type === 'shift' ? 'text-gray-700 font-semibold' :
                                  'text-gray-200 hover:text-gray-400'
                                }`}
                                title={entry.type === 'error' ? entry.error : entry.type === 'shift' && entry.shift ? `${entry.shift.start}-${entry.shift.end}` : ''}
                              >
                                {entry.type === 'empty' ? '·' :
                                 entry.type === 'off' ? 'OFF' :
                                 entry.type === 'shift' && entry.shift ? `${entry.shift.start.slice(0,2)}-${entry.shift.end.slice(0,2)}` :
                                 '⚠️'}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-1 md:px-2 py-1.5 border-b border-r border-gray-200 text-center font-semibold text-emerald-700 bg-emerald-50/50">
                        {totals.day}
                      </td>
                      <td className="px-1 md:px-2 py-1.5 border-b border-r border-gray-200 text-center font-semibold text-indigo-700 bg-indigo-50/50">
                        {totals.night}
                      </td>
                      <td className="px-1 md:px-2 py-1.5 border-b border-r border-gray-200 text-center font-bold text-blue-700 bg-blue-50/50">
                        {totals.total}
                      </td>
                      <td className="px-1 md:px-2 py-1.5 border-b border-gray-200 text-center text-gray-500 text-xs">
                        {totals.workDays}
                      </td>
                    </tr>
                  );
                })}
                {/* Grand totals row */}
                {employees.length > 0 && (
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-50 font-bold">
                    <td className="sticky left-0 z-10 px-2 md:px-3 py-2 border-t-2 border-gray-300 bg-gray-100 text-xs md:text-sm">
                      ИТОГО
                    </td>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                      let dayCount = 0;
                      employees.forEach(emp => {
                        const entry = getEntry(emp.id, day);
                        if (entry.type === 'shift') dayCount++;
                      });
                      return (
                        <td key={day} className="px-0.5 py-1.5 border-t-2 border-gray-300 text-center text-[10px] md:text-xs text-gray-600">
                          {dayCount > 0 ? dayCount : ''}
                        </td>
                      );
                    })}
                    <td className="px-1 md:px-2 py-2 border-t-2 border-l border-gray-300 text-center text-emerald-700 text-xs md:text-sm">{grandTotals.day}</td>
                    <td className="px-1 md:px-2 py-2 border-t-2 border-gray-300 text-center text-indigo-700 text-xs md:text-sm">{grandTotals.night}</td>
                    <td className="px-1 md:px-2 py-2 border-t-2 border-gray-300 text-center text-blue-700 text-xs md:text-sm">{grandTotals.total}</td>
                    <td className="px-1 md:px-2 py-2 border-t-2 border-gray-300 text-center text-gray-400 text-xs">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {employees.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <p className="text-lg mb-2">Нет сотрудников</p>
              <p className="text-sm">Добавьте сотрудников через поле выше</p>
            </div>
          )}
        </div>

        {/* Error messages */}
        <ErrorPanel schedule={schedule} employees={employees} daysInMonth={daysInMonth} />

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-50 border border-emerald-200"></span> Дневная смена</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-50 border border-indigo-200"></span> Ночная смена</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-200"></span> Смешанная</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200"></span> Выходной (OFF)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200"></span> Ошибка</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-50/30 border border-red-100"></span> Выходной день</span>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-400 pb-4">
          🔒 Приватный планировщик смен • Данные хранятся локально в вашем браузере
        </div>
      </div>
    </div>
  );
}

// Error panel component
function ErrorPanel({ schedule, employees, daysInMonth }: {
  schedule: ScheduleData;
  employees: Employee[];
  daysInMonth: number;
}) {
  const errors: { empName: string; day: number; error: string }[] = [];

  employees.forEach(emp => {
    for (let day = 1; day <= daysInMonth; day++) {
      const entry = schedule[emp.id]?.[day];
      if (entry?.type === 'error') {
        errors.push({ empName: emp.name, day, error: entry.error || 'Ошибка' });
      }
    }
  });

  if (errors.length === 0) return null;

  return (
    <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4">
      <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
        <span>⚠️</span> Ошибки в заполнении ({errors.length})
      </h3>
      <ul className="text-sm text-red-700 space-y-1">
        {errors.map((err, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400"></span>
            <span className="font-medium">{err.empName}</span>
            <span className="text-red-500">→</span>
            <span>день {err.day}:</span>
            <span className="italic">{err.error}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
