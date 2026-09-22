import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MessageSquare,
  Pencil,
  Trash2,
} from 'lucide-react';

import { Department, Employee, ScheduleData, ShiftEntry } from '../../domain/models';
import { calculateShiftHours } from '../../domain/schedule/shiftHours';
import { getDayOfWeek } from '../../utils/calendar';
import {
  DepartmentBadge,
  DepartmentRowCell,
  DepartmentRowInner,
  DragHandle,
  EmployeeCell,
  EmployeeCellInner,
  EmployeeNameText,
  EmployeeRow,
  ErrorCard,
  MetricCell,
  RowIconButton,
  ShiftCell,
  ShiftDisplay,
  TinyText,
  WishCount,
} from '../../theme/styles';

export type ScheduleView = 'schedule' | 'hours';

function departmentKindLabel(kind: Department['kind']): string {
  if (kind === 'fo') return 'FO';
  if (kind === 'night') return 'Night';
  return 'Отдел';
}

interface DepartmentSectionProps {
  department: Department;
  employees: Employee[];
  columnCount: number;
  daysInMonth: number;
  year: number;
  month: number;
  setEditingCell: (value: { empId: string; day: number } | null) => void;
  getEntry: (empId: string, day: number) => ShiftEntry;
  getEmployeeTotals: (empId: string) => {
    day: number;
    night: number;
    total: number;
    workDays: number;
  };
  removeEmployee: (id: string) => void;
  onEditEmployee: (employeeId: string) => void;
  getWishCount: (employeeId: string) => number;
  getWishSummary: (employeeId: string) => string;
  onOpenWishes: (employeeId: string) => void;
  scheduleView: ScheduleView;
  wishEditable: boolean;
  employeeProfileEditable: boolean;
  scheduleEditable: boolean;
  employeeDraggable: boolean;
  departmentDraggable: boolean;
  isDragTarget: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function DepartmentSection({
  department,
  employees,
  columnCount,
  daysInMonth,
  year,
  month,
  setEditingCell,
  getEntry,
  getEmployeeTotals,
  removeEmployee,
  onEditEmployee,
  getWishCount,
  getWishSummary,
  onOpenWishes,
  scheduleView,
  wishEditable,
  employeeProfileEditable,
  scheduleEditable,
  employeeDraggable,
  departmentDraggable,
  isDragTarget,
  collapsed,
  onToggleCollapsed,
}: DepartmentSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: 'dept:' + department.id,
  });

  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: 'dep:' + department.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <>
      <tr ref={setSortableNodeRef} style={style}>
        <DepartmentRowCell
          ref={setDropNodeRef}
          colSpan={columnCount}
          $over={isOver || isDragTarget}
        >
          <DepartmentRowInner>
            <DragHandle
              type="button"
              title={
                departmentDraggable
                  ? 'Перетащить весь отдел'
                  : 'Изменение порядка отделов сейчас недоступно'
              }
              disabled={!departmentDraggable}
              {...(departmentDraggable ? attributes : {})}
              {...(departmentDraggable ? listeners : {})}
            >
              <GripVertical size={16} />
            </DragHandle>

            <RowIconButton
              type="button"
              onClick={onToggleCollapsed}
              title={collapsed ? 'Развернуть отдел' : 'Свернуть отдел'}
            >
              {collapsed ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </RowIconButton>

            <strong>{department.name}</strong>
            <DepartmentBadge $kind={department.kind}>
              {departmentKindLabel(department.kind)}
            </DepartmentBadge>
            <TinyText>{employees.length} сотрудников</TinyText>
            {employees.length === 0 && employeeDraggable && (
              <TinyText>Перетащите сотрудника сюда</TinyText>
            )}
          </DepartmentRowInner>
        </DepartmentRowCell>
      </tr>

      {!collapsed && (
        <SortableContext
          items={employees.map((employee) => 'emp:' + employee.id)}
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
              setEditingCell={setEditingCell}
              getEntry={getEntry}
              totals={getEmployeeTotals(employee.id)}
              removeEmployee={removeEmployee}
              onEditEmployee={onEditEmployee}
              wishCount={getWishCount(employee.id)}
              wishSummary={getWishSummary(employee.id)}
              onOpenWishes={onOpenWishes}
              scheduleView={scheduleView}
              wishEditable={wishEditable}
              employeeProfileEditable={employeeProfileEditable}
              scheduleEditable={scheduleEditable}
              draggable={employeeDraggable}
            />
          ))}
        </SortableContext>
      )}
    </>
  );
}

interface SortableEmployeeRowProps {
  employee: Employee;
  index: number;
  daysInMonth: number;
  year: number;
  month: number;
  setEditingCell: (value: { empId: string; day: number } | null) => void;
  getEntry: (empId: string, day: number) => ShiftEntry;
  totals: { day: number; night: number; total: number; workDays: number };
  removeEmployee: (id: string) => void;
  onEditEmployee: (employeeId: string) => void;
  wishCount: number;
  wishSummary: string;
  onOpenWishes: (employeeId: string) => void;
  scheduleView: ScheduleView;
  wishEditable: boolean;
  employeeProfileEditable: boolean;
  scheduleEditable: boolean;
  draggable: boolean;
}

function SortableEmployeeRow({
  employee,
  index,
  daysInMonth,
  year,
  month,
  setEditingCell,
  getEntry,
  totals,
  removeEmployee,
  onEditEmployee,
  wishCount,
  wishSummary,
  onOpenWishes,
  scheduleView,
  wishEditable,
  employeeProfileEditable,
  scheduleEditable,
  draggable,
}: SortableEmployeeRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: 'emp:' + employee.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <EmployeeRow
      ref={setNodeRef}
      style={style}
      $dragging={isDragging}
      $odd={index % 2 === 1}
    >
      <EmployeeCell>
        <EmployeeCellInner>
          <DragHandle
            type="button"
            title={
              draggable
                ? 'Перетащить сотрудника'
                : 'Перемещение сотрудника сейчас недоступно'
            }
            disabled={!draggable}
            {...(draggable ? attributes : {})}
            {...(draggable ? listeners : {})}
          >
            <GripVertical size={16} />
          </DragHandle>

          <EmployeeNameText>{employee.name}</EmployeeNameText>

          {employee.scheduleMode === 'fixed-weekdays' &&
            employee.fixedStartTime &&
            employee.fixedEndTime && (
              <span
                title="Автоматический базовый график 5/2"
                style={{
                  flex: '0 0 auto',
                  padding: '2px 6px',
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 800,
                  opacity: 0.72,
                  whiteSpace: 'nowrap',
                }}
              >
                5/2 {employee.fixedStartTime}-{employee.fixedEndTime}
              </span>
            )}

          <RowIconButton
            type="button"
            $active={wishCount > 0}
            disabled={!wishEditable}
            onClick={() => onOpenWishes(employee.id)}
            title={
              wishSummary
                ? 'Пожелания:\n' + wishSummary
                : 'Добавить пожелания по графику'
            }
          >
            <MessageSquare size={14} />
            {wishCount > 0 && <WishCount>{wishCount}</WishCount>}
          </RowIconButton>

          <RowIconButton
            type="button"
            disabled={!employeeProfileEditable}
            onClick={() => onEditEmployee(employee.id)}
            title="Редактировать сотрудника"
          >
            <Pencil size={14} />
          </RowIconButton>

          <RowIconButton
            type="button"
            disabled={!employeeProfileEditable}
            onClick={() => removeEmployee(employee.id)}
            title="Деактивировать / удалить сотрудника"
          >
            <Trash2 size={14} />
          </RowIconButton>
        </EmployeeCellInner>
      </EmployeeCell>

      {Array.from({ length: daysInMonth }, (_, itemIndex) => itemIndex + 1).map(
        (day) => {
          const entry = getEntry(employee.id, day);
          const dayOfWeek = getDayOfWeek(year, month, day);
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          let kind: 'empty' | 'error' | 'off' | 'day' | 'night' | 'mixed' =
            'empty';

          if (entry.type === 'error') {
            kind = 'error';
          } else if (entry.type === 'off') {
            kind = 'off';
          } else if (entry.type === 'shift') {
            const shiftHours = calculateShiftHours(entry);
            kind =
              shiftHours.night > 0 && shiftHours.day === 0
                ? 'night'
                : shiftHours.night > 0
                  ? 'mixed'
                  : 'day';
          }

          const hours =
            entry.type === 'shift'
              ? calculateShiftHours(entry)
              : { day: 0, night: 0, total: 0 };

          return (
            <ShiftCell
              key={day}
              $kind={kind}
              $weekend={isWeekend}
              $interactive={scheduleEditable && scheduleView === 'schedule'}
              onClick={
                scheduleEditable && scheduleView === 'schedule'
                  ? () => setEditingCell({ empId: employee.id, day })
                  : undefined
              }
            >
              {scheduleView === 'hours' ? (
                <ShiftDisplay
                  style={{
                    flexDirection: 'column',
                    gap: 1,
                    lineHeight: 1.08,
                    cursor: 'default',
                  }}
                  title={
                    entry.type === 'shift'
                      ? 'Дневные: ' + hours.day +
                        ' • Ночные: ' + hours.night +
                        ' • Итого: ' + hours.total
                      : entry.type === 'error'
                        ? entry.error
                        : entry.type === 'off'
                          ? 'Выходной'
                          : ''
                  }
                >
                  {entry.type === 'shift' ? (
                    <>
                      <span style={{ fontSize: 9 }}>Д {hours.day}</span>
                      <span style={{ fontSize: 9 }}>Н {hours.night}</span>
                      <strong style={{ fontSize: 10 }}>Σ {hours.total}</strong>
                    </>
                  ) : entry.type === 'off' ? (
                    'OFF'
                  ) : entry.type === 'error' ? (
                    '⚠'
                  ) : (
                    '·'
                  )}
                </ShiftDisplay>
              ) : (
                <ShiftDisplay
                  title={
                    entry.type === 'error'
                      ? entry.error
                      : entry.type === 'shift' && entry.shift
                        ? (entry.shift.code ? entry.shift.code + ' ' : '') +
                          entry.shift.start + '-' + entry.shift.end
                        : ''
                  }
                >
                  {entry.type === 'empty'
                    ? '·'
                    : entry.type === 'off'
                      ? 'OFF'
                      : entry.type === 'shift' && entry.shift
                        ? entry.shift.code ||
                          entry.shift.start.slice(0, 2) +
                            '-' +
                            entry.shift.end.slice(0, 2)
                        : '⚠'}
                </ShiftDisplay>
              )}
            </ShiftCell>
          );
        }
      )}

      <MetricCell $tone="day">{totals.day}</MetricCell>
      <MetricCell $tone="night">{totals.night}</MetricCell>
      <MetricCell $tone="total">{totals.total}</MetricCell>
      <MetricCell $tone="muted">{totals.workDays}</MetricCell>
    </EmployeeRow>
  );
}

export function ErrorPanel({
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
    <ErrorCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
        <AlertTriangle size={17} />
        Ошибки в заполнении ({errors.length})
      </div>

      <div style={{ marginTop: 8, display: 'grid', gap: 4, fontSize: 13 }}>
        {errors.map((error, index) => (
          <div key={index}>
            <strong>{error.empName}</strong> → день {error.day}: {error.error}
          </div>
        ))}
      </div>
    </ErrorCard>
  );
}


