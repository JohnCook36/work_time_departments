import { useEffect, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronRight, GripVertical, MessageSquare, Trash2 } from 'lucide-react';
import { Department, Employee, ShiftEntry } from '../../domain/models';
import { calculateShiftHours } from '../../domain/schedule/shiftHours';
import { DAY_NAMES_SHORT, getDayOfWeek, MONTH_NAMES } from '../../utils/calendar';
import {
  DepartmentBadge,
  DragHandle,
  IconButton,
  MobileDayLabel,
  MobileDayRow,
  MobileDepartmentBlock,
  MobileDepartmentHeader,
  MobileEmployeeHeader,
  MobileEmployeeName,
  MobileEmployeesList,
  MobileEmptyDepartment,
  MobileHint,
  MobileScheduleShell,
  MobileShiftButton,
  MobileShiftInput,
  MobileTotalChip,
  MobileTotalValue,
  MobileTotals,
  MobileWeekBar,
  MobileWeekLabel,
  RowIconButton,
  TinyText,
  WishCount,
} from '../../theme/styles';
import { MobileDays, SortableMobileEmployeeCard } from './MobileSchedule.styles';

type Totals = { day: number; night: number; total: number; workDays: number };

interface Props {
  departments: Department[];
  employees: Employee[];
  daysInMonth: number;
  year: number;
  month: number;
  getEntry: (empId: string, day: number) => ShiftEntry;
  updateCell: (empId: string, day: number, value: string) => void;
  getDisplayValue: (entry: ShiftEntry) => string;
  getEmployeeTotals: (empId: string) => Totals;
  removeEmployee: (id: string) => void;
  getWishCount: (employeeId: string) => number;
  getWishSummary: (employeeId: string) => string;
  onOpenWishes: (employeeId: string) => void;
}

function mondayStart(year: number, month: number, day: number) {
  const dow = getDayOfWeek(year, month, day);
  return day - ((dow + 6) % 7);
}

function weekStarts(year: number, month: number, daysInMonth: number) {
  const result: number[] = [];
  for (let start = mondayStart(year, month, 1); start <= daysInMonth; start += 7) {
    result.push(start);
  }
  return result;
}

function weekLabel(year: number, month: number, start: number) {
  const first = new Date(year, month, start);
  const last = new Date(year, month, start + 6);
  if (first.getMonth() === last.getMonth()) {
    return first.getDate() + '–' + last.getDate() + ' ' + MONTH_NAMES[last.getMonth()].toLowerCase();
  }
  return first.getDate() + ' ' + MONTH_NAMES[first.getMonth()].toLowerCase() + ' – ' +
    last.getDate() + ' ' + MONTH_NAMES[last.getMonth()].toLowerCase();
}

function kind(entry: ShiftEntry): 'empty' | 'error' | 'off' | 'day' | 'night' | 'mixed' {
  if (entry.type === 'error') return 'error';
  if (entry.type === 'off') return 'off';
  if (entry.type !== 'shift') return 'empty';
  const hours = calculateShiftHours(entry);
  if (hours.night > 0 && hours.day === 0) return 'night';
  if (hours.night > 0) return 'mixed';
  return 'day';
}

function label(entry: ShiftEntry) {
  if (entry.type === 'off') return 'OFF';
  if (entry.type === 'error') return '⚠ Ошибка';
  if (entry.type === 'shift' && entry.shift) return entry.shift.start + ' – ' + entry.shift.end;
  return 'Добавить смену';
}

export function MobileSchedule(props: Props) {
  const starts = useMemo(
    () => weekStarts(props.year, props.month, props.daysInMonth),
    [props.year, props.month, props.daysInMonth]
  );
  const [weekIndex, setWeekIndex] = useState(0);
  const [editing, setEditing] = useState<{ empId: string; day: number } | null>(null);

  useEffect(() => {
    const now = new Date();
    if (now.getFullYear() === props.year && now.getMonth() === props.month) {
      const currentStart = mondayStart(props.year, props.month, now.getDate());
      const index = starts.indexOf(currentStart);
      setWeekIndex(index >= 0 ? index : 0);
    } else {
      setWeekIndex(0);
    }
    setEditing(null);
  }, [props.year, props.month, starts]);

  const start = starts[Math.min(weekIndex, starts.length - 1)] ?? 1;
  const days = Array.from({ length: 7 }, (_, i) => start + i)
    .filter((day) => day >= 1 && day <= props.daysInMonth);

  return (
    <MobileScheduleShell>
      <MobileWeekBar>
        <IconButton type="button" disabled={weekIndex === 0}
          onClick={() => setWeekIndex((v) => Math.max(0, v - 1))}>
          <ChevronLeft size={18} />
        </IconButton>
        <MobileWeekLabel>{weekLabel(props.year, props.month, start)}</MobileWeekLabel>
        <IconButton type="button" disabled={weekIndex >= starts.length - 1}
          onClick={() => setWeekIndex((v) => Math.min(starts.length - 1, v + 1))}>
          <ChevronRight size={18} />
        </IconButton>
      </MobileWeekBar>

      <MobileHint>На телефоне показывается одна неделя. Нажмите на смену, чтобы изменить её.</MobileHint>

      {props.departments.map((department) => (
        <MobileDepartment
          key={department.id}
          {...props}
          department={department}
          employees={props.employees.filter((e) => e.departmentId === department.id)}
          days={days}
          editing={editing}
          setEditing={setEditing}
        />
      ))}
    </MobileScheduleShell>
  );
}

function MobileDepartment({
  department,
  employees,
  days,
  editing,
  setEditing,
  ...props
}: Props & {
  department: Department;
  employees: Employee[];
  days: number[];
  editing: { empId: string; day: number } | null;
  setEditing: (value: { empId: string; day: number } | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'dep:' + department.id });

  return (
    <MobileDepartmentBlock ref={setNodeRef}>
      <MobileDepartmentHeader $over={isOver}>
        <strong>{department.name}</strong>
        <DepartmentBadge $kind={department.kind}>
          {department.kind === 'fo' ? 'FO' : department.kind === 'night' ? 'Night' : 'Отдел'}
        </DepartmentBadge>
        <TinyText>{employees.length}</TinyText>
      </MobileDepartmentHeader>

      <SortableContext items={employees.map((e) => 'emp:' + e.id)} strategy={verticalListSortingStrategy}>
        <MobileEmployeesList>
          {employees.length === 0 ? (
            <MobileEmptyDepartment>Перетащите сотрудника в этот отдел</MobileEmptyDepartment>
          ) : employees.map((employee) => (
            <MobileEmployee
              key={employee.id}
              employees={employees}
              employee={employee}
              days={days}
              editing={editing}
              setEditing={setEditing}
              totals={props.getEmployeeTotals(employee.id)}
              {...props}
            />
          ))}
        </MobileEmployeesList>
      </SortableContext>
    </MobileDepartmentBlock>
  );
}

function MobileEmployee({
  employee,
  days,
  editing,
  setEditing,
  totals,
  ...props
}: Props & {
  employee: Employee;
  days: number[];
  editing: { empId: string; day: number } | null;
  setEditing: (value: { empId: string; day: number } | null) => void;
  totals: Totals;
}) {
  const sortable = useSortable({ id: 'emp:' + employee.id });
  const transform = CSS.Transform.toString(sortable.transform);
  const wishCount = props.getWishCount(employee.id);
  const wishSummary = props.getWishSummary(employee.id);

  return (
    <SortableMobileEmployeeCard
      ref={sortable.setNodeRef}
      $transform={transform}
      $transition={sortable.transition}
      $dragging={sortable.isDragging}
    >
      <MobileEmployeeHeader>
        <DragHandle type="button" {...sortable.attributes} {...sortable.listeners}>
          <GripVertical size={17} />
        </DragHandle>
        <MobileEmployeeName>{employee.name}</MobileEmployeeName>
        <RowIconButton type="button" $active={wishCount > 0}
          onClick={() => props.onOpenWishes(employee.id)}
          title={wishSummary || 'Пожелания'}>
          <MessageSquare size={15} />
          {wishCount > 0 && <WishCount>{wishCount}</WishCount>}
        </RowIconButton>
        <RowIconButton type="button" onClick={() => props.removeEmployee(employee.id)}>
          <Trash2 size={14} />
        </RowIconButton>
      </MobileEmployeeHeader>

      <MobileTotals>
        <MobileTotalChip $tone="day">Днев.<MobileTotalValue>{totals.day}</MobileTotalValue></MobileTotalChip>
        <MobileTotalChip $tone="night">Ночн.<MobileTotalValue>{totals.night}</MobileTotalValue></MobileTotalChip>
        <MobileTotalChip $tone="total">Итого<MobileTotalValue>{totals.total}</MobileTotalValue></MobileTotalChip>
        <MobileTotalChip $tone="muted">Дней<MobileTotalValue>{totals.workDays}</MobileTotalValue></MobileTotalChip>
      </MobileTotals>

      <MobileDays>
        {days.map((day) => {
          const entry = props.getEntry(employee.id, day);
          const dow = getDayOfWeek(props.year, props.month, day);
          const isEditing = editing?.empId === employee.id && editing.day === day;
          return (
            <MobileDayRow key={day} $weekend={dow === 0 || dow === 6} $kind={kind(entry)}>
              <MobileDayLabel>
                <div>{DAY_NAMES_SHORT[dow]}</div>
                <strong>{day} {MONTH_NAMES[props.month].slice(0, 3).toLowerCase()}</strong>
              </MobileDayLabel>

              {isEditing ? (
                <MobileShiftInput
                  autoFocus
                  defaultValue={props.getDisplayValue(entry)}
                  placeholder="08:00-17:00 или OFF"
                  onBlur={(event) => {
                    props.updateCell(employee.id, day, event.target.value);
                    setEditing(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      props.updateCell(employee.id, day, (event.target as HTMLInputElement).value);
                      setEditing(null);
                    }
                    if (event.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <MobileShiftButton type="button" onClick={() => setEditing({ empId: employee.id, day })}>
                  {label(entry)}
                </MobileShiftButton>
              )}
            </MobileDayRow>
          );
        })}
      </MobileDays>
    </SortableMobileEmployeeCard>
  );
}
