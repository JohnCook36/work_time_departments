import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { Department, DepartmentKind, Employee, ShiftEntry } from '../types';
import { calculateShiftHours, DAY_NAMES_SHORT, getDayOfWeek } from '../utils';

function displayValue(entry: ShiftEntry): string {
  if (entry.type === 'shift' && entry.shift) {
    const code = entry.shift.code ? `${entry.shift.code} ` : '';
    return `${code}${entry.shift.start}-${entry.shift.end}`;
  }
  if (entry.type === 'off') return 'OFF';
  if (entry.type === 'vac') return 'VAC';
  if (entry.type === 'sick') return 'SICK';
  return '';
}

function kindLabel(kind: DepartmentKind): string {
  if (kind === 'fo') return 'FO · до 5 одновременно';
  if (kind === 'night') return 'Night · только ночь';
  return 'Обычный отдел';
}

function DepartmentHeader({ department, count, colSpan }: { department: Department; count: number; colSpan: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `department:${department.id}` });
  return (
    <tr ref={setNodeRef}>
      <td colSpan={colSpan} className={`border-y border-slate-300 px-3 py-2 transition-colors ${isOver ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : 'bg-slate-100'}`}>
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-700">{department.name}</span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">{count} чел.</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${department.kind === 'fo' ? 'bg-blue-100 text-blue-700' : department.kind === 'night' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{kindLabel(department.kind)}</span>
          <span className="ml-auto text-[11px] text-slate-400">Бросьте сотрудника сюда, чтобы сменить отдел</span>
        </div>
      </td>
    </tr>
  );
}

interface RowProps {
  employee: Employee;
  index: number;
  year: number;
  month: number;
  daysInMonth: number;
  editingCell: { empId: string; day: number } | null;
  getEntry: (empId: string, day: number) => ShiftEntry;
  updateCell: (empId: string, day: number, value: string) => void;
  setEditingCell: (value: { empId: string; day: number } | null) => void;
  onRemove: (id: string) => void;
  totals: { day: number; night: number; total: number; workDays: number };
}

function EmployeeRow({ employee, index, year, month, daysInMonth, editingCell, getEntry, updateCell, setEditingCell, onRemove, totals }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `employee:${employee.id}` });
  return (
    <tr ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, position: 'relative', zIndex: isDragging ? 20 : 'auto' }} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/40`}>
      <td className="sticky left-0 z-10 min-w-[215px] border-b border-r border-gray-200 bg-inherit px-2 py-1.5 font-medium backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button type="button" className="flex h-7 w-6 flex-shrink-0 cursor-grab touch-none items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing" title="Перетащить сотрудника" aria-label={`Перетащить ${employee.name}`} {...attributes} {...listeners}>⋮⋮</button>
          <span className="min-w-0 flex-1 truncate text-xs md:text-sm">{employee.name}</span>
          <button onClick={() => onRemove(employee.id)} className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs text-red-300 hover:bg-red-50 hover:text-red-500" title="Удалить">✕</button>
        </div>
      </td>
      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
        const entry = getEntry(employee.id, day);
        const dow = getDayOfWeek(year, month, day);
        const isWeekend = dow === 0 || dow === 6;
        const isEditing = editingCell?.empId === employee.id && editingCell?.day === day;
        const hours = entry.type === 'shift' ? calculateShiftHours(entry, employee) : null;
        let cellBg = '';
        if (entry.type === 'error') cellBg = 'bg-red-100';
        else if (entry.type === 'off') cellBg = 'bg-gray-100';
        else if (entry.type === 'vac') cellBg = 'bg-red-100/80';
        else if (entry.type === 'sick') cellBg = 'bg-cyan-100';
        else if (entry.type === 'shift' && hours) cellBg = hours.night > 0 && hours.day === 0 ? 'bg-indigo-50' : hours.night > 0 ? 'bg-amber-50' : 'bg-emerald-50';
        return (
          <td key={day} className={`border-b border-r border-gray-100 px-px py-px text-center ${isWeekend && entry.type === 'empty' ? 'bg-red-50/30' : ''} ${cellBg}`} onClick={() => setEditingCell({ empId: employee.id, day })}>
            {isEditing ? (
              <input
                type="text"
                defaultValue={displayValue(entry)}
                autoFocus
                className="w-full rounded-sm border border-blue-400 bg-white px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                onBlur={event => { updateCell(employee.id, day, event.target.value); setEditingCell(null); }}
                onKeyDown={event => {
                  if (event.key === 'Enter') { updateCell(employee.id, day, (event.target as HTMLInputElement).value); setEditingCell(null); }
                  if (event.key === 'Escape') setEditingCell(null);
                  if (event.key === 'Tab') { event.preventDefault(); updateCell(employee.id, day, (event.target as HTMLInputElement).value); setEditingCell(day < daysInMonth ? { empId: employee.id, day: day + 1 } : null); }
                }}
              />
            ) : (
              <div className={`flex min-h-[22px] cursor-pointer items-center justify-center rounded-sm px-0.5 py-0.5 text-[10px] md:text-xs ${entry.type === 'error' ? 'font-bold text-red-600' : entry.type === 'off' ? 'font-medium text-gray-400' : entry.type === 'vac' ? 'font-semibold text-red-600' : entry.type === 'sick' ? 'font-semibold text-cyan-700' : entry.type === 'shift' ? 'font-semibold text-gray-700' : 'text-gray-200 hover:text-gray-400'}`} title={entry.type === 'error' ? entry.error : displayValue(entry)}>
                {entry.type === 'empty' ? '·' : entry.type === 'error' ? '⚠️' : entry.type === 'shift' && entry.shift ? `${entry.shift.code ? `${entry.shift.code} ` : ''}${entry.shift.start.slice(0, 2)}-${entry.shift.end.slice(0, 2)}` : displayValue(entry)}
              </div>
            )}
          </td>
        );
      })}
      <td className="border-b border-r border-gray-200 bg-emerald-50/50 px-2 py-1.5 text-center font-semibold text-emerald-700">{totals.day}</td>
      <td className="border-b border-r border-gray-200 bg-indigo-50/50 px-2 py-1.5 text-center font-semibold text-indigo-700">{totals.night}</td>
      <td className="border-b border-r border-gray-200 bg-blue-50/50 px-2 py-1.5 text-center font-bold text-blue-700">{totals.total}</td>
      <td className="border-b border-gray-200 px-2 py-1.5 text-center text-xs text-gray-500">{totals.workDays}</td>
    </tr>
  );
}

interface Props {
  departments: Department[];
  employees: Employee[];
  year: number;
  month: number;
  daysInMonth: number;
  editingCell: { empId: string; day: number } | null;
  getEntry: (empId: string, day: number) => ShiftEntry;
  updateCell: (empId: string, day: number, value: string) => void;
  setEditingCell: (value: { empId: string; day: number } | null) => void;
  onRemoveEmployee: (id: string) => void;
  getTotals: (employee: Employee) => { day: number; night: number; total: number; workDays: number };
  grandTotals: { day: number; night: number; total: number };
  onMoveEmployee: (activeEmployeeId: string, overId: string) => void;
}

export default function ScheduleTable(props: Props) {
  const { departments, employees, year, month, daysInMonth, editingCell, getEntry, updateCell, setEditingCell, onRemoveEmployee, getTotals, grandTotals, onMoveEmployee } = props;
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeEmployee = activeEmployeeId ? employees.find(employee => employee.id === activeEmployeeId) ?? null : null;
  const columnCount = daysInMonth + 5;

  const handleStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith('employee:')) setActiveEmployeeId(id.replace('employee:', ''));
  };
  const handleEnd = (event: DragEndEvent) => {
    setActiveEmployeeId(null);
    if (!event.over) return;
    onMoveEmployee(String(event.active.id).replace('employee:', ''), String(event.over.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleStart} onDragEnd={handleEnd} onDragCancel={() => setActiveEmployeeId(null)}>
      <div className="overflow-hidden rounded-2xl bg-white/90 shadow-lg backdrop-blur">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs md:text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-gray-800 to-gray-700 text-white">
                <th className="sticky left-0 z-10 min-w-[215px] border-r border-gray-600 bg-gray-800 px-3 py-2 text-left font-medium">Сотрудник</th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const dow = getDayOfWeek(year, month, day);
                  return <th key={day} className={`min-w-[58px] px-0.5 py-1 text-center font-medium ${dow === 0 || dow === 6 ? 'bg-red-900/30' : ''}`}><div className="text-[10px] opacity-60">{DAY_NAMES_SHORT[dow]}</div><div className="text-xs md:text-sm">{day}</div></th>;
                })}
                <th className="min-w-[60px] border-l border-gray-600 bg-emerald-800/50 px-2 py-2 text-center font-medium">☀️<br />Днев.</th>
                <th className="min-w-[60px] bg-indigo-800/50 px-2 py-2 text-center font-medium">🌙<br />Ночн.</th>
                <th className="min-w-[60px] bg-blue-800/50 px-2 py-2 text-center font-medium">Σ<br />Итого</th>
                <th className="min-w-[50px] px-2 py-2 text-center font-medium">📅<br />Дней</th>
              </tr>
            </thead>
            <tbody>
              {departments.map(department => {
                const list = employees.filter(employee => employee.departmentId === department.id);
                return (
                  <SortableContext key={department.id} items={list.map(employee => `employee:${employee.id}`)} strategy={verticalListSortingStrategy}>
                    <DepartmentHeader department={department} count={list.length} colSpan={columnCount} />
                    {list.map((employee, index) => (
                      <EmployeeRow key={employee.id} employee={employee} index={index} year={year} month={month} daysInMonth={daysInMonth} editingCell={editingCell} getEntry={getEntry} updateCell={updateCell} setEditingCell={setEditingCell} onRemove={onRemoveEmployee} totals={getTotals(employee)} />
                    ))}
                  </SortableContext>
                );
              })}
              {employees.length > 0 && (
                <tr className="bg-gradient-to-r from-gray-100 to-gray-50 font-bold">
                  <td className="sticky left-0 z-10 border-t-2 border-gray-300 bg-gray-100 px-3 py-2">ИТОГО</td>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                    const count = employees.filter(employee => getEntry(employee.id, day).type === 'shift').length;
                    return <td key={day} className="border-t-2 border-gray-300 px-0.5 py-1.5 text-center text-[10px] text-gray-600 md:text-xs">{count || ''}</td>;
                  })}
                  <td className="border-l border-t-2 border-gray-300 px-2 py-2 text-center text-emerald-700">{grandTotals.day}</td>
                  <td className="border-t-2 border-gray-300 px-2 py-2 text-center text-indigo-700">{grandTotals.night}</td>
                  <td className="border-t-2 border-gray-300 px-2 py-2 text-center text-blue-700">{grandTotals.total}</td>
                  <td className="border-t-2 border-gray-300 px-2 py-2 text-center text-gray-400">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <DragOverlay>{activeEmployee ? <div className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-2xl">⋮⋮ {activeEmployee.name}</div> : null}</DragOverlay>
    </DndContext>
  );
}
