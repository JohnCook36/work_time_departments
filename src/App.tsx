import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Department, DepartmentKind, Employee, ScheduleData, ShiftEntry } from './types';
import {
  validateShiftInput,
  calculateShiftHours,
  getDaysInMonth,
  getDayOfWeek,
  MONTH_NAMES,
  DAY_NAMES_SHORT
} from './utils';

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

const DEFAULT_DEPARTMENT_ID = 'front-office';

const DEFAULT_DEPARTMENTS: Department[] = [
  { id: DEFAULT_DEPARTMENT_ID, name: 'Front Office', kind: 'general' },
];

const DEFAULT_EMPLOYEES: Employee[] = [
  { id: '1', name: 'Иванова А.М.', departmentId: DEFAULT_DEPARTMENT_ID },
  { id: '2', name: 'Петров С.В.', departmentId: DEFAULT_DEPARTMENT_ID },
  { id: '3', name: 'Сидорова Е.К.', departmentId: DEFAULT_DEPARTMENT_ID },
  { id: '4', name: 'Козлов Д.И.', departmentId: DEFAULT_DEPARTMENT_ID },
];

const STORAGE_KEY = 'hotel-shift-planner';

interface StoredData {
  employees: Array<Employee | Omit<Employee, 'departmentId'>>;
  departments?: Department[];
  schedule: ScheduleData;
}

function loadFromStorage(): {
  employees: Employee[];
  departments: Department[];
  schedule: ScheduleData;
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as StoredData;
    const departments =
      Array.isArray(data.departments) && data.departments.length > 0
        ? data.departments
        : DEFAULT_DEPARTMENTS;

    const fallbackDepartmentId = departments[0].id;
    const employees = Array.isArray(data.employees)
      ? data.employees.map((employee) => ({
          ...employee,
          departmentId:
            'departmentId' in employee && employee.departmentId
              ? employee.departmentId
              : fallbackDepartmentId,
        }))
      : DEFAULT_EMPLOYEES;

    return {
      employees,
      departments,
      schedule: data.schedule || {},
    };
  } catch {
    return null;
  }
}

function saveToStorage(
  employees: Employee[],
  departments: Department[],
  schedule: ScheduleData
) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ employees, departments, schedule })
    );
  } catch {
    // Local storage may be unavailable in private/restricted browser modes.
  }
}

function departmentKindLabel(kind: DepartmentKind) {
  if (kind === 'fo') return 'FO';
  if (kind === 'night') return 'Night';
  return 'Отдел';
}

function App() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const stored = useMemo(() => loadFromStorage(), []);
  const [departments, setDepartments] = useState<Department[]>(
    stored?.departments || DEFAULT_DEPARTMENTS
  );
  const [employees, setEmployees] = useState<Employee[]>(
    stored?.employees || DEFAULT_EMPLOYEES
  );
  const [schedule, setSchedule] = useState<ScheduleData>(stored?.schedule || {});

  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeDepartmentId, setNewEmployeeDepartmentId] = useState(
    (stored?.departments || DEFAULT_DEPARTMENTS)[0].id
  );
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentKind, setNewDepartmentKind] =
    useState<DepartmentKind>('general');
  const [editingCell, setEditingCell] = useState<{
    empId: string;
    day: number;
  } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showDepartments, setShowDepartments] = useState(false);

  const daysInMonth = getDaysInMonth(year, month);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  useEffect(() => {
    saveToStorage(employees, departments, schedule);
  }, [employees, departments, schedule]);

  useEffect(() => {
    if (!departments.some((department) => department.id === newEmployeeDepartmentId)) {
      setNewEmployeeDepartmentId(departments[0]?.id || '');
    }
  }, [departments, newEmployeeDepartmentId]);

  const getEntry = useCallback(
    (empId: string, day: number): ShiftEntry => {
      return schedule[empId]?.[day] || { type: 'empty' };
    },
    [schedule]
  );

  const updateCell = useCallback((empId: string, day: number, value: string) => {
    const entry = validateShiftInput(value);
    setSchedule((prev) => ({
      ...prev,
      [empId]: {
        ...(prev[empId] || {}),
        [day]: entry,
      },
    }));
  }, []);

  const getEmployeeTotals = useCallback(
    (empId: string) => {
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
        workDays,
      };
    },
    [daysInMonth, getEntry]
  );

  const addEmployee = () => {
    const name = newEmployeeName.trim();
    if (!name || !newEmployeeDepartmentId) return;

    setEmployees((prev) => [
      ...prev,
      {
        id: generateId(),
        name,
        departmentId: newEmployeeDepartmentId,
      },
    ]);
    setNewEmployeeName('');
  };

  const removeEmployee = (id: string) => {
    if (!confirm('Удалить сотрудника и все его смены?')) return;

    setEmployees((prev) => prev.filter((employee) => employee.id !== id));
    setSchedule((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const addDepartment = () => {
    const name = newDepartmentName.trim();
    if (!name) return;

    const department: Department = {
      id: generateId(),
      name,
      kind: newDepartmentKind,
    };

    setDepartments((prev) => [...prev, department]);
    setNewEmployeeDepartmentId(department.id);
    setNewDepartmentName('');
    setNewDepartmentKind('general');
  };

  const renameDepartment = (department: Department) => {
    const nextName = prompt('Новое название отдела', department.name)?.trim();
    if (!nextName || nextName === department.name) return;

    setDepartments((prev) =>
      prev.map((item) =>
        item.id === department.id ? { ...item, name: nextName } : item
      )
    );
  };

  const changeDepartmentKind = (
    departmentId: string,
    kind: DepartmentKind
  ) => {
    setDepartments((prev) =>
      prev.map((department) =>
        department.id === departmentId ? { ...department, kind } : department
      )
    );
  };

  const removeDepartment = (departmentId: string) => {
    if (departments.length === 1) {
      alert('Должен остаться хотя бы один отдел.');
      return;
    }

    if (employees.some((employee) => employee.departmentId === departmentId)) {
      alert('Сначала перенесите сотрудников в другой отдел.');
      return;
    }

    if (!confirm('Удалить пустой отдел?')) return;
    setDepartments((prev) =>
      prev.filter((department) => department.id !== departmentId)
    );
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;

    const activeRaw = String(active.id);
    const overRaw = String(over.id);
    if (!activeRaw.startsWith('emp:')) return;

    const activeEmployeeId = activeRaw.slice(4);
    const overEmployeeId = overRaw.startsWith('emp:') ? overRaw.slice(4) : null;
    const targetDepartmentId = overRaw.startsWith('dep:')
      ? overRaw.slice(4)
      : overEmployeeId
        ? employees.find((employee) => employee.id === overEmployeeId)?.departmentId
        : undefined;

    if (!targetDepartmentId) return;

    setEmployees((prev) => {
      const sourceIndex = prev.findIndex((employee) => employee.id === activeEmployeeId);
      if (sourceIndex === -1) return prev;

      const moved = {
        ...prev[sourceIndex],
        departmentId: targetDepartmentId,
      };

      const next = prev.filter((employee) => employee.id !== activeEmployeeId);

      if (overEmployeeId && overEmployeeId !== activeEmployeeId) {
        const overIndex = next.findIndex((employee) => employee.id === overEmployeeId);
        if (overIndex >= 0) {
          next.splice(overIndex, 0, moved);
          return next;
        }
      }

      let insertIndex = -1;
      for (let index = next.length - 1; index >= 0; index--) {
        if (next[index].departmentId === targetDepartmentId) {
          insertIndex = index + 1;
          break;
        }
      }

      if (insertIndex === -1) {
        const departmentIndex = departments.findIndex(
          (department) => department.id === targetDepartmentId
        );
        const laterDepartmentIds = new Set(
          departments.slice(departmentIndex + 1).map((department) => department.id)
        );
        insertIndex = next.findIndex((employee) =>
          laterDepartmentIds.has(employee.departmentId)
        );
        if (insertIndex === -1) insertIndex = next.length;
      }

      next.splice(insertIndex, 0, moved);
      return next;
    });
  };

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((value) => value - 1);
    } else {
      setMonth((value) => value - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((value) => value + 1);
    } else {
      setMonth((value) => value + 1);
    }
  };

  const getDisplayValue = (entry: ShiftEntry): string => {
    if (entry.type === 'shift' && entry.shift) {
      return `${entry.shift.start}-${entry.shift.end}`;
    }
    if (entry.type === 'off') return 'OFF';
    return '';
  };

  const grandTotals = useMemo(() => {
    let day = 0;
    let night = 0;
    let total = 0;

    employees.forEach((employee) => {
      const employeeTotals = getEmployeeTotals(employee.id);
      day += employeeTotals.day;
      night += employeeTotals.night;
      total += employeeTotals.total;
    });

    return {
      day: Math.round(day * 100) / 100,
      night: Math.round(night * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [employees, getEmployeeTotals]);

  const fillOffAll = () => {
    if (!confirm('Заполнить все пустые ячейки как OFF (выходной)?')) return;

    setSchedule((prev) => {
      const next = { ...prev };
      employees.forEach((employee) => {
        if (!next[employee.id]) next[employee.id] = {};
        for (let day = 1; day <= daysInMonth; day++) {
          if (!next[employee.id][day] || next[employee.id][day].type === 'empty') {
            next[employee.id] = {
              ...next[employee.id],
              [day]: { type: 'off' },
            };
          }
        }
      });
      return next;
    });
  };

  const clearAll = () => {
    if (!confirm('Очистить все смены за текущий месяц?')) return;
    setSchedule({});
  };

  const columnCount = daysInMonth + 5;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-3 md:p-6">
      <div className="max-w-full mx-auto">
        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
                <span className="text-2xl md:text-3xl">🏨</span>
                <span>Планировщик смен</span>
              </h1>
              <p className="text-gray-500 text-xs md:text-sm mt-1">
                Расписание сотрудников отеля • Отделы • Drag & Drop
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Предыдущий месяц"
              >
                ‹
              </button>
              <span className="text-base md:text-lg font-semibold text-gray-700 min-w-[160px] text-center select-none">
                {MONTH_NAMES[month]} {year}
              </span>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Следующий месяц"
              >
                ›
              </button>
              <button
                onClick={() => setShowHelp((value) => !value)}
                className="ml-2 p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-500"
                title="Справка"
              >
                ⓘ
              </button>
            </div>
          </div>
        </div>

        {showHelp && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 md:mb-6">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h3 className="font-semibold text-blue-800 mb-2">📋 Как пользоваться</h3>
                <div className="grid md:grid-cols-2 gap-4 text-sm text-blue-700">
                  <div>
                    <p>Смена: <code>08:00-16:00</code></p>
                    <p>Выходной: <code>OFF</code></p>
                    <p>Ночная: <code>22:00-06:00</code></p>
                  </div>
                  <div>
                    <p>⋮⋮ — перетащить сотрудника.</p>
                    <p>Можно менять порядок внутри отдела и переносить между отделами.</p>
                    <p>Перетащите сотрудника на заголовок пустого отдела, чтобы поместить его туда.</p>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowHelp(false)} className="text-blue-500">✕</button>
            </div>
          </div>
        )}

        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-3 md:p-4 mb-4 md:mb-6">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <input
              type="text"
              value={newEmployeeName}
              onChange={(event) => setNewEmployeeName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addEmployee()}
              placeholder="ФИО нового сотрудника..."
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 flex-1 min-w-[190px] text-sm"
            />
            <select
              value={newEmployeeDepartmentId}
              onChange={(event) => setNewEmployeeDepartmentId(event.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
            >
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <button
              onClick={addEmployee}
              className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm whitespace-nowrap"
            >
              + Сотрудник
            </button>
            <button
              onClick={() => setShowDepartments((value) => !value)}
              className="px-3 py-2 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors text-sm whitespace-nowrap"
            >
              🗂 Отделы
            </button>
            <div className="h-6 w-px bg-gray-200 hidden md:block" />
            <button
              onClick={fillOffAll}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
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

        {showDepartments && (
          <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-4 mb-4 md:mb-6">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <h2 className="font-bold text-gray-800">Отделы сотрудников</h2>
                <p className="text-xs text-gray-500">
                  Создавайте отделы, меняйте тип и переносите сотрудников прямо в таблице.
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <input
                  value={newDepartmentName}
                  onChange={(event) => setNewDepartmentName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && addDepartment()}
                  placeholder="Название отдела"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <select
                  value={newDepartmentKind}
                  onChange={(event) =>
                    setNewDepartmentKind(event.target.value as DepartmentKind)
                  }
                  className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
                >
                  <option value="general">Обычный</option>
                  <option value="fo">FO Agents</option>
                  <option value="night">Night Agents</option>
                </select>
                <button
                  onClick={addDepartment}
                  className="px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium"
                >
                  + Отдел
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
              {departments.map((department) => {
                const employeeCount = employees.filter(
                  (employee) => employee.departmentId === department.id
                ).length;

                return (
                  <div
                    key={department.id}
                    className="border border-gray-200 rounded-xl p-3 flex items-center gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-gray-800 truncate">
                        {department.name}
                      </div>
                      <div className="text-xs text-gray-400">
                        {employeeCount} сотрудников
                      </div>
                    </div>

                    <select
                      value={department.kind}
                      onChange={(event) =>
                        changeDepartmentKind(
                          department.id,
                          event.target.value as DepartmentKind
                        )
                      }
                      className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      <option value="general">Отдел</option>
                      <option value="fo">FO</option>
                      <option value="night">Night</option>
                    </select>

                    <button
                      onClick={() => renameDepartment(department)}
                      className="text-gray-400 hover:text-blue-600"
                      title="Переименовать"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => removeDepartment(department.id)}
                      className="text-gray-300 hover:text-red-500"
                      title="Удалить пустой отдел"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-800 to-gray-700 text-white">
                    <th className="sticky left-0 bg-gray-800 z-20 px-2 md:px-3 py-2 text-left font-medium min-w-[190px] md:min-w-[220px] border-r border-gray-600">
                      Сотрудник
                    </th>
                    {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
                      (day) => {
                        const dayOfWeek = getDayOfWeek(year, month, day);
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                        return (
                          <th
                            key={day}
                            className={`px-0.5 py-1 text-center font-medium min-w-[52px] md:min-w-[60px] ${
                              isWeekend ? 'bg-red-900/30' : ''
                            }`}
                          >
                            <div className="text-[10px] opacity-60">
                              {DAY_NAMES_SHORT[dayOfWeek]}
                            </div>
                            <div className="text-xs md:text-sm">{day}</div>
                          </th>
                        );
                      }
                    )}
                    <th className="px-1 md:px-2 py-2 text-center font-medium bg-emerald-800/50 min-w-[55px] md:min-w-[65px] border-l border-gray-600">
                      ☀️ Днев.
                    </th>
                    <th className="px-1 md:px-2 py-2 text-center font-medium bg-indigo-800/50 min-w-[55px] md:min-w-[65px]">
                      🌙 Ночн.
                    </th>
                    <th className="px-1 md:px-2 py-2 text-center font-medium bg-blue-800/50 min-w-[55px] md:min-w-[65px]">
                      Σ Итого
                    </th>
                    <th className="px-1 md:px-2 py-2 text-center font-medium min-w-[50px]">
                      📅 Дней
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {departments.map((department) => {
                    const departmentEmployees = employees.filter(
                      (employee) => employee.departmentId === department.id
                    );

                    return (
                      <DepartmentSection
                        key={department.id}
                        department={department}
                        employees={departmentEmployees}
                        columnCount={columnCount}
                        daysInMonth={daysInMonth}
                        year={year}
                        month={month}
                        schedule={schedule}
                        editingCell={editingCell}
                        setEditingCell={setEditingCell}
                        getEntry={getEntry}
                        updateCell={updateCell}
                        getDisplayValue={getDisplayValue}
                        getEmployeeTotals={getEmployeeTotals}
                        removeEmployee={removeEmployee}
                      />
                    );
                  })}

                  {employees.length > 0 && (
                    <tr className="bg-gradient-to-r from-gray-100 to-gray-50 font-bold">
                      <td className="sticky left-0 z-10 px-2 md:px-3 py-2 border-t-2 border-gray-300 bg-gray-100 text-xs md:text-sm">
                        ИТОГО
                      </td>
                      {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
                        (day) => {
                          let dayCount = 0;
                          employees.forEach((employee) => {
                            if (getEntry(employee.id, day).type === 'shift') dayCount++;
                          });

                          return (
                            <td
                              key={day}
                              className="px-0.5 py-1.5 border-t-2 border-gray-300 text-center text-[10px] md:text-xs text-gray-600"
                            >
                              {dayCount || ''}
                            </td>
                          );
                        }
                      )}
                      <td className="px-1 md:px-2 py-2 border-t-2 border-l border-gray-300 text-center text-emerald-700">
                        {grandTotals.day}
                      </td>
                      <td className="px-1 md:px-2 py-2 border-t-2 border-gray-300 text-center text-indigo-700">
                        {grandTotals.night}
                      </td>
                      <td className="px-1 md:px-2 py-2 border-t-2 border-gray-300 text-center text-blue-700">
                        {grandTotals.total}
                      </td>
                      <td className="px-1 md:px-2 py-2 border-t-2 border-gray-300 text-center text-gray-400">
                        —
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {employees.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                <p className="text-lg mb-2">Нет сотрудников</p>
                <p className="text-sm">Добавьте сотрудника и выберите для него отдел.</p>
              </div>
            )}
          </div>
        </DndContext>

        <ErrorPanel
          schedule={schedule}
          employees={employees}
          daysInMonth={daysInMonth}
        />

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
          <span>⋮⋮ Перетащить сотрудника</span>
          <span>☀️ Дневная смена</span>
          <span>🌙 Ночная смена</span>
          <span>OFF Выходной</span>
        </div>

        <div className="mt-6 text-center text-xs text-gray-400 pb-4">
          🔒 Данные хранятся локально в вашем браузере
        </div>
      </div>
    </div>
  );
}

interface DepartmentSectionProps {
  department: Department;
  employees: Employee[];
  columnCount: number;
  daysInMonth: number;
  year: number;
  month: number;
  schedule: ScheduleData;
  editingCell: { empId: string; day: number } | null;
  setEditingCell: (value: { empId: string; day: number } | null) => void;
  getEntry: (empId: string, day: number) => ShiftEntry;
  updateCell: (empId: string, day: number, value: string) => void;
  getDisplayValue: (entry: ShiftEntry) => string;
  getEmployeeTotals: (empId: string) => {
    day: number;
    night: number;
    total: number;
    workDays: number;
  };
  removeEmployee: (id: string) => void;
}

function DepartmentSection({
  department,
  employees,
  columnCount,
  daysInMonth,
  year,
  month,
  editingCell,
  setEditingCell,
  getEntry,
  updateCell,
  getDisplayValue,
  getEmployeeTotals,
  removeEmployee,
}: DepartmentSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `dep:${department.id}`,
  });

  return (
    <>
      <tr ref={setNodeRef}>
        <td
          colSpan={columnCount}
          className={`border-y border-slate-300 px-3 py-2 transition-colors ${
            isOver ? 'bg-blue-100' : 'bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">{department.name}</span>
            <span
              className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                department.kind === 'fo'
                  ? 'bg-blue-100 text-blue-700'
                  : department.kind === 'night'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-slate-200 text-slate-600'
              }`}
            >
              {departmentKindLabel(department.kind)}
            </span>
            <span className="text-xs text-slate-400">
              {employees.length} сотрудников
            </span>
            {employees.length === 0 && (
              <span className="text-xs text-blue-500 ml-2">
                Перетащите сотрудника сюда
              </span>
            )}
          </div>
        </td>
      </tr>

      <SortableContext
        items={employees.map((employee) => `emp:${employee.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {employees.map((employee, index) => (
          <SortableEmployeeRow
            key={employee.id}
            employee={employee}
            index={index}
            daysInMonth={daysInMonth}
            year={year}
            month={month}
            editingCell={editingCell}
            setEditingCell={setEditingCell}
            getEntry={getEntry}
            updateCell={updateCell}
            getDisplayValue={getDisplayValue}
            totals={getEmployeeTotals(employee.id)}
            removeEmployee={removeEmployee}
          />
        ))}
      </SortableContext>
    </>
  );
}

interface SortableEmployeeRowProps {
  employee: Employee;
  index: number;
  daysInMonth: number;
  year: number;
  month: number;
  editingCell: { empId: string; day: number } | null;
  setEditingCell: (value: { empId: string; day: number } | null) => void;
  getEntry: (empId: string, day: number) => ShiftEntry;
  updateCell: (empId: string, day: number, value: string) => void;
  getDisplayValue: (entry: ShiftEntry) => string;
  totals: { day: number; night: number; total: number; workDays: number };
  removeEmployee: (id: string) => void;
}

function SortableEmployeeRow({
  employee,
  index,
  daysInMonth,
  year,
  month,
  editingCell,
  setEditingCell,
  getEntry,
  updateCell,
  getDisplayValue,
  totals,
  removeEmployee,
}: SortableEmployeeRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `emp:${employee.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${
        isDragging ? 'opacity-40' : ''
      } hover:bg-blue-50/30 transition-colors`}
    >
      <td className="sticky left-0 z-10 px-2 md:px-3 py-1.5 border-b border-r border-gray-200 font-medium bg-inherit backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-blue-600 px-1 py-1 touch-none"
            title="Перетащить сотрудника"
            {...attributes}
            {...listeners}
          >
            ⋮⋮
          </button>
          <span className="truncate text-xs md:text-sm flex-1">{employee.name}</span>
          <button
            onClick={() => removeEmployee(employee.id)}
            className="text-red-300 hover:text-red-500 text-xs flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-red-50"
            title="Удалить"
          >
            ✕
          </button>
        </div>
      </td>

      {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
        const entry = getEntry(employee.id, day);
        const dayOfWeek = getDayOfWeek(year, month, day);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isEditing =
          editingCell?.empId === employee.id && editingCell?.day === day;

        let cellBg = '';
        if (entry.type === 'error') cellBg = 'bg-red-100';
        else if (entry.type === 'off') cellBg = 'bg-gray-100';
        else if (entry.type === 'shift') {
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
            onClick={() => setEditingCell({ empId: employee.id, day })}
          >
            {isEditing ? (
              <input
                type="text"
                defaultValue={getDisplayValue(entry)}
                autoFocus
                className="w-full px-1 py-0.5 text-center text-xs border border-blue-400 rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                onBlur={(event) => {
                  updateCell(employee.id, day, event.target.value);
                  setEditingCell(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    updateCell(
                      employee.id,
                      day,
                      (event.target as HTMLInputElement).value
                    );
                    setEditingCell(null);
                  }

                  if (event.key === 'Escape') {
                    setEditingCell(null);
                  }

                  if (event.key === 'Tab') {
                    event.preventDefault();
                    updateCell(
                      employee.id,
                      day,
                      (event.target as HTMLInputElement).value
                    );
                    if (day < daysInMonth) {
                      setEditingCell({ empId: employee.id, day: day + 1 });
                    }
                  }
                }}
              />
            ) : (
              <div
                className={`px-0.5 py-0.5 text-[10px] md:text-xs rounded-sm cursor-pointer min-h-[22px] flex items-center justify-center ${
                  entry.type === 'error'
                    ? 'text-red-600 font-bold'
                    : entry.type === 'off'
                      ? 'text-gray-400 font-medium'
                      : entry.type === 'shift'
                        ? 'text-gray-700 font-semibold'
                        : 'text-gray-200 hover:text-gray-400'
                }`}
                title={
                  entry.type === 'error'
                    ? entry.error
                    : entry.type === 'shift' && entry.shift
                      ? `${entry.shift.start}-${entry.shift.end}`
                      : ''
                }
              >
                {entry.type === 'empty'
                  ? '·'
                  : entry.type === 'off'
                    ? 'OFF'
                    : entry.type === 'shift' && entry.shift
                      ? `${entry.shift.start.slice(0, 2)}-${entry.shift.end.slice(0, 2)}`
                      : '⚠️'}
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
}

function ErrorPanel({
  schedule,
  employees,
  daysInMonth,
}: {
  schedule: ScheduleData;
  employees: Employee[];
  daysInMonth: number;
}) {
  const errors: { empName: string; day: number; error: string }[] = [];

  employees.forEach((employee) => {
    for (let day = 1; day <= daysInMonth; day++) {
      const entry = schedule[employee.id]?.[day];
      if (entry?.type === 'error') {
        errors.push({
          empName: employee.name,
          day,
          error: entry.error || 'Ошибка',
        });
      }
    }
  });

  if (errors.length === 0) return null;

  return (
    <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4">
      <h3 className="font-semibold text-red-800 mb-2">
        ⚠️ Ошибки в заполнении ({errors.length})
      </h3>
      <ul className="text-sm text-red-700 space-y-1">
        {errors.map((error, index) => (
          <li key={index}>
            <span className="font-medium">{error.empName}</span>
            {' → '}день {error.day}: <span className="italic">{error.error}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
