import { useCallback, useEffect, useMemo, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import DepartmentManager from './components/DepartmentManager';
import ErrorPanel from './components/ErrorPanel';
import ScheduleTable from './components/ScheduleTable';
import { Department, Employee, ScheduleData, ShiftEntry } from './types';
import { calculateShiftHours, getDaysInMonth, makeDateKey, MONTH_NAMES, validateShiftInput } from './utils';
import { generateId, loadState, saveState, STORAGE_VERSION, UNGROUPED_ID } from './plannerStorage';

function App() {
  const now = new Date();
  const initialState = useMemo(() => loadState(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [departments, setDepartments] = useState<Department[]>(initialState.departments);
  const [employees, setEmployees] = useState<Employee[]>(initialState.employees);
  const [schedule, setSchedule] = useState<ScheduleData>(initialState.schedule);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeDepartment, setNewEmployeeDepartment] = useState(initialState.departments.find(item => item.kind === 'fo')?.id ?? initialState.departments[0]?.id ?? UNGROUPED_ID);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [showDepartments, setShowDepartments] = useState(true);
  const [editingCell, setEditingCell] = useState<{ empId: string; day: number } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const daysInMonth = getDaysInMonth(year, month);
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;

  useEffect(() => {
    saveState({ version: STORAGE_VERSION, departments, employees, schedule });
  }, [departments, employees, schedule]);

  useEffect(() => {
    if (!departments.some(item => item.id === newEmployeeDepartment)) setNewEmployeeDepartment(departments[0]?.id ?? UNGROUPED_ID);
  }, [departments, newEmployeeDepartment]);

  const getEntry = useCallback((empId: string, day: number): ShiftEntry => {
    return schedule[empId]?.[makeDateKey(year, month, day)] || { type: 'empty' };
  }, [schedule, year, month]);

  const updateCell = useCallback((empId: string, day: number, value: string) => {
    const key = makeDateKey(year, month, day);
    const entry = validateShiftInput(value);
    setSchedule(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [key]: entry } }));
  }, [year, month]);

  const getTotals = useCallback((employee: Employee) => {
    let dayHours = 0, nightHours = 0, total = 0, workDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const entry = getEntry(employee.id, day);
      if (entry.type !== 'shift') continue;
      const hours = calculateShiftHours(entry, employee);
      dayHours += hours.day;
      nightHours += hours.night;
      total += hours.total;
      workDays += 1;
    }
    const round = (value: number) => Math.round(value * 100) / 100;
    return { day: round(dayHours), night: round(nightHours), total: round(total), workDays };
  }, [daysInMonth, getEntry]);

  const grandTotals = useMemo(() => {
    let day = 0, night = 0, total = 0;
    employees.forEach(employee => {
      const value = getTotals(employee);
      day += value.day; night += value.night; total += value.total;
    });
    const round = (value: number) => Math.round(value * 100) / 100;
    return { day: round(day), night: round(night), total: round(total) };
  }, [employees, getTotals]);

  const addEmployee = () => {
    const name = newEmployeeName.trim();
    if (!name) return;
    setEmployees(prev => [...prev, { id: generateId('employee'), name, departmentId: newEmployeeDepartment, targetHours: 40, breakMinutes: 60 }]);
    setNewEmployeeName('');
  };

  const removeEmployee = (id: string) => {
    if (!confirm('Удалить сотрудника и все его смены?')) return;
    setEmployees(prev => prev.filter(employee => employee.id !== id));
    setSchedule(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  const addDepartment = () => {
    const name = newDepartmentName.trim();
    if (!name) return;
    setDepartments(prev => [...prev, { id: generateId('department'), name, kind: 'generic' }]);
    setNewDepartmentName('');
  };

  const updateDepartment = (id: string, patch: Partial<Department>) => setDepartments(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  const moveDepartment = (id: string, direction: -1 | 1) => setDepartments(prev => {
    const index = prev.findIndex(item => item.id === id);
    const nextIndex = index + direction;
    return index < 0 || nextIndex < 0 || nextIndex >= prev.length ? prev : arrayMove(prev, index, nextIndex);
  });
  const removeDepartment = (id: string) => {
    if (id === UNGROUPED_ID) return alert('Системную группу «Без отдела» удалить нельзя.');
    if (employees.some(employee => employee.departmentId === id)) return alert('Сначала перенесите сотрудников из этого отдела.');
    if (confirm('Удалить пустой отдел?')) setDepartments(prev => prev.filter(item => item.id !== id));
  };

  const moveEmployee = (activeId: string, overId: string) => setEmployees(prev => {
    const activeIndex = prev.findIndex(employee => employee.id === activeId);
    if (activeIndex < 0) return prev;
    const dragged = prev[activeIndex];
    if (overId.startsWith('department:')) {
      const departmentId = overId.replace('department:', '');
      if (!departments.some(item => item.id === departmentId)) return prev;
      const next = prev.filter(employee => employee.id !== activeId);
      const last = next.reduce((found, employee, index) => employee.departmentId === departmentId ? index : found, -1);
      next.splice(last >= 0 ? last + 1 : next.length, 0, { ...dragged, departmentId });
      return next;
    }
    if (overId.startsWith('employee:')) {
      const targetId = overId.replace('employee:', '');
      if (targetId === activeId) return prev;
      const target = prev.find(employee => employee.id === targetId);
      if (!target) return prev;
      const next = prev.filter(employee => employee.id !== activeId);
      const targetIndex = next.findIndex(employee => employee.id === targetId);
      next.splice(targetIndex, 0, { ...dragged, departmentId: target.departmentId });
      return next;
    }
    return prev;
  });

  const fillOffAll = () => {
    if (!confirm('Заполнить все пустые ячейки текущего месяца как OFF?')) return;
    setSchedule(prev => {
      const next: ScheduleData = { ...prev };
      employees.forEach(employee => {
        const employeeSchedule = { ...(next[employee.id] || {}) };
        for (let day = 1; day <= daysInMonth; day++) {
          const key = makeDateKey(year, month, day);
          if (!employeeSchedule[key] || employeeSchedule[key].type === 'empty') employeeSchedule[key] = { type: 'off' };
        }
        next[employee.id] = employeeSchedule;
      });
      return next;
    });
  };

  const clearMonth = () => {
    if (!confirm(`Очистить все смены за ${MONTH_NAMES[month].toLowerCase()} ${year}?`)) return;
    setSchedule(prev => {
      const next: ScheduleData = {};
      Object.entries(prev).forEach(([employeeId, employeeSchedule]) => {
        const filtered = Object.fromEntries(Object.entries(employeeSchedule).filter(([key]) => !key.startsWith(monthPrefix)));
        if (Object.keys(filtered).length) next[employeeId] = filtered;
      });
      return next;
    });
  };

  const prevMonth = () => month === 0 ? (setMonth(11), setYear(value => value - 1)) : setMonth(value => value - 1);
  const nextMonth = () => month === 11 ? (setMonth(0), setYear(value => value + 1)) : setMonth(value => value + 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-3 md:p-6">
      <div className="mx-auto max-w-full">
        <header className="mb-4 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur md:mb-6 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="flex items-center gap-2 text-xl font-bold text-gray-800 md:text-2xl"><span className="text-2xl md:text-3xl">🏨</span>Планировщик смен</h1><p className="mt-1 text-xs text-gray-500 md:text-sm">Расписание сотрудников отеля · отделы · drag & drop · локальное хранение</p></div>
            <div className="flex items-center gap-2"><button onClick={prevMonth} className="rounded-lg p-2 hover:bg-gray-100">←</button><span className="min-w-[160px] text-center text-base font-semibold text-gray-700 md:text-lg">{MONTH_NAMES[month]} {year}</span><button onClick={nextMonth} className="rounded-lg p-2 hover:bg-gray-100">→</button><button onClick={() => setShowHelp(value => !value)} className="ml-2 rounded-lg p-2 text-blue-500 hover:bg-blue-50">ⓘ</button></div>
          </div>
        </header>

        {showHelp && <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 md:mb-6"><div className="flex items-start justify-between gap-4"><div className="space-y-1"><p className="font-semibold text-blue-900">Как пользоваться</p><p>Смены: <code>08:00-17:00</code>, <code>E 07:00-16:00</code>, <code>N 20:30-07:30</code>, <code>OFF</code>, <code>VAC</code>, <code>SICK</code>.</p><p>Сотрудника перетаскивайте за <strong>⋮⋮</strong>: внутри отдела или на заголовок другого отдела.</p><p>Обычная смена: минус 1 час перерыва. N = 12 рабочих часов. Ночь: 22:00–06:00.</p></div><button onClick={() => setShowHelp(false)}>✕</button></div></div>}

        <section className="mb-4 rounded-2xl bg-white/90 p-3 shadow-lg backdrop-blur md:mb-6 md:p-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <input value={newEmployeeName} onChange={event => setNewEmployeeName(event.target.value)} onKeyDown={event => event.key === 'Enter' && addEmployee()} placeholder="ФИО нового сотрудника..." className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <select value={newEmployeeDepartment} onChange={event => setNewEmployeeDepartment(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <button onClick={addEmployee} className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">+ Сотрудник</button>
            <button onClick={() => setShowDepartments(value => !value)} className={`rounded-lg px-3 py-2 text-sm font-medium ${showDepartments ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}>🗂 Отделы</button>
            <div className="hidden h-6 w-px bg-gray-200 md:block" /><button onClick={fillOffAll} className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200">📋 OFF все</button><button onClick={clearMonth} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100">🗑 Очистить месяц</button>
          </div>
        </section>

        {showDepartments && <DepartmentManager departments={departments} employees={employees} newDepartmentName={newDepartmentName} onNewDepartmentName={setNewDepartmentName} onAdd={addDepartment} onUpdate={updateDepartment} onMove={moveDepartment} onRemove={removeDepartment} />}

        <ScheduleTable departments={departments} employees={employees} year={year} month={month} daysInMonth={daysInMonth} editingCell={editingCell} getEntry={getEntry} updateCell={updateCell} setEditingCell={setEditingCell} onRemoveEmployee={removeEmployee} getTotals={getTotals} grandTotals={grandTotals} onMoveEmployee={moveEmployee} />
        <ErrorPanel schedule={schedule} employees={employees} year={year} month={month} daysInMonth={daysInMonth} />

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500"><span>🟩 Дневная</span><span>🟦 Ночная</span><span>🟨 Смешанная</span><span>⬜ OFF</span><span>🟥 VAC</span><span>🩵 SICK</span><span>⋮⋮ Перетаскивание</span></div>
        <div className="mt-6 pb-4 text-center text-xs text-gray-400">🔒 Данные графика и состав отделов хранятся локально в вашем браузере</div>
      </div>
    </div>
  );
}

export default App;
