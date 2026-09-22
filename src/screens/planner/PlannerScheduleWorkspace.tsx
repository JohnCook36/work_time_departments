import { createPortal } from 'react-dom';
import { useTheme } from '@emotion/react';
import { DragOverlay } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';

import {
  Department,
  Employee,
  EmployeeWishesData,
  EmploymentRate,
  ScheduleData,
  ShiftEntry,
} from '../../types';
import {
  calculateShiftHours,
  DAY_NAMES_SHORT,
  getDayOfWeek,
} from '../../utils';
import { WeeklyHoursPanel } from '../../WeeklyHoursPanel';
import {
  HeaderCell,
  Legend,
  MetricCell,
  ScheduleTable,
  StickyHeaderCell,
  StickyTotalCell,
  TableHeadRow,
  TableScroll,
  TableShell,
  TotalCell,
  TotalRow,
} from '../../styles';
import {
  DepartmentSection,
  ErrorPanel,
  ScheduleView,
} from './PlannerScheduleTable';

interface EmployeeTotals {
  day: number;
  night: number;
  total: number;
  workDays: number;
}

interface WeekRangeLike {
  key: string;
  start: number;
  end: number;
  label: string;
}

interface PlannerScheduleWorkspaceProps {
  departments: Department[];
  employees: Employee[];
  daysInMonth: number;
  year: number;
  month: number;
  schedule: ScheduleData;
  periodKey: string;
  wishes: EmployeeWishesData;
  scheduleView: ScheduleView;
  onEditCell: (value: { empId: string; day: number } | null) => void;
  getEntry: (employeeId: string, day: number) => ShiftEntry;
  getEmployeeTotals: (employeeId: string) => EmployeeTotals;
  onRemoveEmployee: (employeeId: string) => void;
  onEditEmployee: (employeeId: string) => void;
  onOpenWishes: (employeeId: string) => void;
  canEditWishes: boolean;
  canManageEmployeeProfiles: boolean;
  canEditScheduleCells: boolean;
  canMoveEmployees: boolean;
  canMoveDepartments: boolean;
  dragTargetDepartmentId: string | null;
  activeDragId: string | null;
  collapsedDepartments: string[];
  onToggleDepartmentCollapsed: (departmentId: string) => void;
  grandTotals: EmployeeTotals;
  draggedEmployee: Employee | null;
  draggedDepartment: Department | null;
  dragTargetDepartment: Department | null;
  printWeekRanges: WeekRangeLike[];
  onRateChange: (employeeId: string, rate: EmploymentRate) => void;
  canEditEmployeeRate: boolean;
  updatingEmployeeRateId: string | null;
}

export function PlannerScheduleWorkspace({
  departments,
  employees,
  daysInMonth,
  year,
  month,
  schedule,
  periodKey,
  wishes,
  scheduleView,
  onEditCell,
  getEntry,
  getEmployeeTotals,
  onRemoveEmployee,
  onEditEmployee,
  onOpenWishes,
  canEditWishes,
  canManageEmployeeProfiles,
  canEditScheduleCells,
  canMoveEmployees,
  canMoveDepartments,
  dragTargetDepartmentId,
  activeDragId,
  collapsedDepartments,
  onToggleDepartmentCollapsed,
  grandTotals,
  draggedEmployee,
  draggedDepartment,
  dragTargetDepartment,
  printWeekRanges,
  onRateChange,
  canEditEmployeeRate,
  updatingEmployeeRateId,
}: PlannerScheduleWorkspaceProps) {
  const theme = useTheme();
  const columnCount = daysInMonth + 5;

  return (
    <>
      <TableShell>
        <TableScroll>
          <ScheduleTable>
            <thead>
              <TableHeadRow>
                <StickyHeaderCell>Сотрудник</StickyHeaderCell>

                {Array.from(
                  { length: daysInMonth },
                  (_, index) => index + 1
                ).map((day) => {
                  const dayOfWeek = getDayOfWeek(year, month, day);
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                  return (
                    <HeaderCell key={day} $weekend={isWeekend}>
                      <div style={{ fontSize: 10, opacity: 0.68 }}>
                        {DAY_NAMES_SHORT[dayOfWeek]}
                      </div>
                      <div>{day}</div>
                    </HeaderCell>
                  );
                })}

                <HeaderCell>☀️<br />Днев.</HeaderCell>
                <HeaderCell>🌙<br />Ночн.</HeaderCell>
                <HeaderCell>Σ<br />Итого</HeaderCell>
                <HeaderCell>📅<br />Дней</HeaderCell>
              </TableHeadRow>
            </thead>

            <tbody>
              <SortableContext
                items={departments.map((department) => 'dept:' + department.id)}
                strategy={verticalListSortingStrategy}
              >
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
                      setEditingCell={onEditCell}
                      getEntry={getEntry}
                      getEmployeeTotals={getEmployeeTotals}
                      removeEmployee={onRemoveEmployee}
                      onEditEmployee={onEditEmployee}
                      getWishCount={(employeeId) =>
                        wishes[employeeId]?.[periodKey]?.length || 0
                      }
                      getWishSummary={(employeeId) =>
                        (wishes[employeeId]?.[periodKey] || [])
                          .slice(0, 3)
                          .map(
                            (wish) =>
                              (wish.day === null
                                ? 'Общее'
                                : String(wish.day)) +
                              ': ' +
                              wish.text
                          )
                          .join('\n')
                      }
                      onOpenWishes={onOpenWishes}
                      scheduleView={scheduleView}
                      wishEditable={canEditWishes}
                      employeeProfileEditable={canManageEmployeeProfiles}
                      scheduleEditable={canEditScheduleCells}
                      employeeDraggable={canMoveEmployees}
                      departmentDraggable={canMoveDepartments}
                      isDragTarget={
                        dragTargetDepartmentId === department.id &&
                        activeDragId?.startsWith('emp:') === true
                      }
                      collapsed={collapsedDepartments.includes(department.id)}
                      onToggleCollapsed={() =>
                        onToggleDepartmentCollapsed(department.id)
                      }
                    />
                  );
                })}
              </SortableContext>
            </tbody>

            {employees.length > 0 && (
              <tfoot>
                <TotalRow>
                  <StickyTotalCell>ИТОГО</StickyTotalCell>

                  {Array.from(
                    { length: daysInMonth },
                    (_, index) => index + 1
                  ).map((day) => {
                    let dayCount = 0;
                    let dayPaidHours = 0;

                    employees.forEach((employee) => {
                      const entry = getEntry(employee.id, day);
                      if (entry.type === 'shift') {
                        dayCount++;
                        dayPaidHours += calculateShiftHours(entry).total;
                      }
                    });

                    return (
                      <TotalCell key={day}>
                        {scheduleView === 'hours'
                          ? dayPaidHours > 0
                            ? Math.round(dayPaidHours * 100) / 100
                            : ''
                          : dayCount > 0
                            ? dayCount
                            : ''}
                      </TotalCell>
                    );
                  })}

                  <MetricCell $tone="day">{grandTotals.day}</MetricCell>
                  <MetricCell $tone="night">{grandTotals.night}</MetricCell>
                  <MetricCell $tone="total">{grandTotals.total}</MetricCell>
                  <MetricCell $tone="muted">—</MetricCell>
                </TotalRow>
              </tfoot>
            )}
          </ScheduleTable>
        </TableScroll>

        {employees.length === 0 && (
          <div style={{ padding: 28, textAlign: 'center' }}>
            Сотрудников пока нет.
          </div>
        )}
      </TableShell>

      {createPortal(
        <DragOverlay
          zIndex={10000}
          adjustScale={false}
          dropAnimation={{ duration: 140, easing: 'ease-out' }}
        >
          {draggedEmployee ? (
            <div
              style={{
                minWidth: 260,
                maxWidth: 360,
                padding: '11px 14px',
                borderRadius: 12,
                border: '1px solid ' + theme.colors.primary,
                background: theme.colors.surfaceElevated,
                color: theme.colors.text,
                boxShadow: '0 18px 45px rgba(15,23,42,.28)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <GripVertical size={17} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>{draggedEmployee.name}</div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11,
                    color: theme.colors.textMuted,
                  }}
                >
                  {dragTargetDepartment
                    ? 'Переместить в: ' + dragTargetDepartment.name
                    : 'Перетащите в нужный отдел'}
                </div>
              </div>
            </div>
          ) : draggedDepartment ? (
            <div
              style={{
                minWidth: 250,
                padding: '11px 14px',
                borderRadius: 12,
                border: '1px solid ' + theme.colors.primary,
                background: theme.colors.surfaceElevated,
                color: theme.colors.text,
                boxShadow: '0 18px 45px rgba(15,23,42,.28)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontWeight: 800,
              }}
            >
              <GripVertical size={17} />
              {draggedDepartment.name}
            </div>
          ) : null}
        </DragOverlay>,
        document.body
      )}

      {scheduleView === 'hours' && employees.length > 0 && (
        <WeeklyHoursPanel
          employees={employees}
          schedule={schedule}
          year={year}
          month={month}
          weeks={printWeekRanges}
          onRateChange={onRateChange}
          readOnly={!canEditEmployeeRate || updatingEmployeeRateId !== null}
        />
      )}

      <ErrorPanel
        schedule={schedule}
        employees={employees}
        daysInMonth={daysInMonth}
      />

      <Legend>
        <span>⋮⋮ Перетащить сотрудника или отдел</span>
        <span>▾ / › Свернуть отдел</span>
        <span>💬 Пожелания</span>
        <span>График / День-ночь — два режима таблицы</span>
        <span>☀️ Дневная смена</span>
        <span>🌙 Ночная смена</span>
        <span>OFF Выходной</span>
      </Legend>
    </>
  );
}
