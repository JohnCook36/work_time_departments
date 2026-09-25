import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Heart } from 'lucide-react';
import {
  Department,
  Employee,
  EmploymentRate,
  EmployeeWishesData,
  ScheduleData,
  SchedulePeriodsData,
  ShiftEntry,
} from '../../domain/models';
import { calculateShiftHours } from '../../domain/schedule/shiftHours';
import { getDaysInMonth } from '../../utils/calendar';
import { EmployeeEditValues } from '../../components/drawers/EmployeeEditDrawer';
import {
  getMonthWeekRanges,
  getVisibleMonthWeekRanges,
} from '../../services/print/printSchedule';
import { hasManagementAccess, useAuthUser } from '../../auth/AuthContext';
import { getRuntimeConfig } from '../../config/runtime';
import { PlannerServerSnapshot, saveFixedWeekdaysSchedule } from '../../api/planner';
import { buildEffectiveSchedule } from '../../domain/schedule/employeeSchedule';
import { useDepartmentManagement } from '../../hooks/useDepartmentManagement';
import { useEmployeeManagement } from '../../hooks/useEmployeeManagement';
import { usePlannerDnD } from '../../hooks/usePlannerDnD';
import { usePlannerScheduleTools } from '../../hooks/usePlannerScheduleTools';
import { usePlannerServerSync } from '../../hooks/usePlannerServerSync';
import { usePlannerStorage } from '../../hooks/usePlannerStorage';
import { usePlannerWishes } from '../../hooks/usePlannerWishes';
import { useScheduleMutations } from '../../hooks/useScheduleMutations';
import { useAppTheme } from '../../theme/AppThemeProvider';
import { useAppDialog } from '../../components/dialogs/AppDialogProvider';
import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import { PlannerHeaderScreen } from './PlannerHeaderScreen';
import { PlannerManagementScreen } from './PlannerManagementScreen';
import type { EmployeeCreateFormValues } from './PlannerControlsToolbar';
import { PlannerOverlays } from './PlannerOverlays';
import { PlannerScheduleWorkspace } from './PlannerScheduleWorkspace';
import { ScheduleView } from './PlannerScheduleTable';
import {
  EmployeeSelfServiceCard,
  EmployeeSelfServiceText,
  PoweredByLine,
} from './PlannerScreen.styles';
import {
  Card,
  Container,
  Footer,
  Muted,
  Page,
  PanelTitle,
} from '../../theme/styles';

function getPeriodKey(year: number, month: number): string {
  return year + '-' + String(month + 1).padStart(2, '0');
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

export function PlannerScreen() {
  const authUser = useAuthUser();
  const canManagePlanner = hasManagementAccess(authUser);
  const runtimeConfig = getRuntimeConfig();
  const serverPlannerWriteEnabled =
    canManagePlanner && runtimeConfig.serverPlannerWriteEnabled;
  const serverPlannerReadEnabled =
    canManagePlanner && runtimeConfig.serverPlannerReadEnabled;
  const canEditPlanner = canManagePlanner && !serverPlannerReadEnabled;
  const canEditScheduleCells =
    canManagePlanner &&
    (!serverPlannerReadEnabled || serverPlannerWriteEnabled);
  const isSuperAdmin = authUser.memberships.some(
    (membership) => membership.role === 'SUPER_ADMIN'
  );
  const initialNow = useMemo(() => new Date(), []);
  const initialPeriodKey = getPeriodKey(
    initialNow.getFullYear(),
    initialNow.getMonth()
  );
  const { load: loadPlannerStorage, persist: persistPlannerStorage } =
    usePlannerStorage(!serverPlannerReadEnabled, authUser.id);
  const stored = useMemo(
    () =>
      loadPlannerStorage(initialPeriodKey, {
        departments: DEFAULT_DEPARTMENTS,
        employees: DEFAULT_EMPLOYEES,
      }),
    [initialPeriodKey, loadPlannerStorage]
  );

  const [year, setYear] = useState(initialNow.getFullYear());
  const [month, setMonth] = useState(initialNow.getMonth());
  const { themeMode, toggleTheme } = useAppTheme();
  const { showMessage, confirmAction, promptText } = useAppDialog();

  const [departments, setDepartments] = useState<Department[]>(
    serverPlannerReadEnabled
      ? []
      : stored?.departments || DEFAULT_DEPARTMENTS
  );
  const [employees, setEmployees] = useState<Employee[]>(
    serverPlannerReadEnabled ? [] : stored?.employees || DEFAULT_EMPLOYEES
  );
  const [schedules, setSchedules] = useState<SchedulePeriodsData>(
    serverPlannerReadEnabled ? {} : stored?.schedules || {}
  );
  const [wishes, setWishes] = useState<EmployeeWishesData>(
    serverPlannerReadEnabled ? {} : stored?.wishes || {}
  );
  const [collapsedDepartments, setCollapsedDepartments] = useState<string[]>(
    serverPlannerReadEnabled ? [] : stored?.collapsedDepartments || []
  );

  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [editingCell, setEditingCell] = useState<{
    empId: string;
    day: number;
  } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showDepartments, setShowDepartments] = useState(false);
  const [wishEmployeeId, setWishEmployeeId] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(
    null
  );
  const [scheduleView, setScheduleView] = useState<ScheduleView>('schedule');

  const applyServerPlannerSnapshot = useCallback(
    (snapshot: PlannerServerSnapshot) => {
      setDepartments(snapshot.departments);
      setEmployees(snapshot.employees);
      setSchedules((prev) => ({
        ...prev,
        [getPeriodKey(year, month)]: snapshot.schedule,
      }));
      setWishes(snapshot.wishes);
    },
    [month, year]
  );

  const {
    status: serverPlannerStatus,
    error: serverPlannerError,
    cellMetadata: serverCellMetadata,
    employeeMetadata: serverEmployeeMetadata,
    departmentMetadata: serverDepartmentMetadata,
    refresh: refreshServerPlanner,
  } = usePlannerServerSync({
    enabled: serverPlannerReadEnabled,
    year,
    month,
    onSnapshot: applyServerPlannerSnapshot,
  });

  const {
    createEmployee,
    changeEmployeeRate,
    updateEmployee,
    deactivateEmployee,
    isCreatingEmployee,
    updatingEmployeeRateId,
    mutatingEmployeeId,
  } = useEmployeeManagement({
    serverPlannerWriteEnabled,
    serverPlannerStatus,
    serverEmployeeMetadata,
    setEmployees,
    setSchedules,
    setWishes,
    refreshServerPlanner,
  });

  const {
    activeDragId,
    dragTargetDepartmentId,
    movingEmployeeId,
    movingDepartmentId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    clearDragState,
  } = usePlannerDnD({
    employees,
    departments,
    setEmployees,
    setDepartments,
    serverPlannerReadEnabled,
    serverPlannerWriteEnabled,
    serverPlannerStatus,
    serverEmployeeMetadata,
    serverDepartmentMetadata,
    isSuperAdmin,
    refreshServerPlanner,
  });

  const {
    addWish,
    removeWish,
    mutatingWishId,
  } = usePlannerWishes({
    setWishes,
    periodKey: getPeriodKey(year, month),
    year,
    month,
    serverPlannerWriteEnabled,
    serverPlannerStatus,
    refreshServerPlanner,
  });

  const canManageEmployeeProfiles =
    canManagePlanner &&
    (!serverPlannerReadEnabled ||
      (serverPlannerWriteEnabled &&
        serverPlannerStatus === 'ready' &&
        mutatingEmployeeId === null));
  const canCreateEmployee = canManageEmployeeProfiles;
  const canEditWishes =
    canManagePlanner &&
    (!serverPlannerReadEnabled ||
      (serverPlannerWriteEnabled &&
        serverPlannerStatus === 'ready' &&
        mutatingWishId === null));
  const canEditEmployeeRate =
    canManagePlanner &&
    (!serverPlannerReadEnabled ||
      (serverPlannerWriteEnabled && serverPlannerStatus === 'ready'));
  const canImportExcel =
    canManagePlanner &&
    (!serverPlannerReadEnabled ||
      (serverPlannerWriteEnabled && serverPlannerStatus === 'ready'));
  const canMoveEmployees =
    canManagePlanner &&
    (!serverPlannerReadEnabled ||
      (serverPlannerWriteEnabled &&
        serverPlannerStatus === 'ready' &&
        movingEmployeeId === null));
  const canMoveDepartments =
    canManagePlanner &&
    (!serverPlannerReadEnabled ||
      (serverPlannerWriteEnabled &&
        isSuperAdmin &&
        serverPlannerStatus === 'ready' &&
        movingDepartmentId === null));
  const canManageDepartments =
    canManagePlanner &&
    (!serverPlannerReadEnabled ||
      (serverPlannerWriteEnabled &&
        isSuperAdmin &&
        serverPlannerStatus === 'ready'));

  const {
    createDepartment,
    renameDepartment: renameDepartmentById,
    deactivateDepartment,
    mutatingDepartmentId,
  } = useDepartmentManagement({
    serverPlannerWriteEnabled,
    canManageDepartments,
    serverDepartmentMetadata,
    setDepartments,
    setCollapsedDepartments,
    refreshServerPlanner,
  });

  const periodKey = getPeriodKey(year, month);
  const rawSchedule = schedules[periodKey] || {};
  const schedule = useMemo(
    () => buildEffectiveSchedule(employees, rawSchedule, year, month),
    [employees, rawSchedule, year, month]
  );
  const daysInMonth = getDaysInMonth(year, month);
  const printWeekRanges = useMemo(
    () => getVisibleMonthWeekRanges(year, month, daysInMonth),
    [year, month, daysInMonth]
  );
  const printCalendarWeekRanges = useMemo(
    () => getMonthWeekRanges(year, month, daysInMonth),
    [year, month, daysInMonth]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  useEffect(() => {
    persistPlannerStorage({
      employees,
      departments,
      schedules,
      wishes,
      collapsedDepartments,
    });
  }, [
    persistPlannerStorage,
    employees,
    departments,
    schedules,
    wishes,
    collapsedDepartments,
  ]);

  useEffect(() => {
    if (!serverPlannerReadEnabled) {
      setEditingEmployeeId(null);
      return;
    }

    setEditingCell(null);
    setWishEmployeeId(null);
  }, [serverPlannerReadEnabled]);

  const updateCurrentSchedule = useCallback(
    (updater: (current: ScheduleData) => ScheduleData) => {
      setSchedules((prev) => ({
        ...prev,
        [periodKey]: updater(prev[periodKey] || {}),
      }));
    },
    [periodKey]
  );

  const {
    excelRangeKey,
    setExcelRangeKey,
    isExportingExcel,
    isImportingExcel,
    isApplyingExcelImport,
    excelImportPreview,
    overwriteExcelCells,
    setOverwriteExcelCells,
    printRangeKey,
    setPrintRangeKey,
    isPreparingPrint,
    handleExportExcel,
    handlePrintSchedule,
    handleExcelFile,
    excelImportConflictCount,
    applyExcelImport,
    closeExcelImport,
  } = usePlannerScheduleTools({
    departments,
    employees,
    schedule,
    schedules,
    rawSchedule,
    year,
    month,
    daysInMonth,
    periodKey,
    serverPlannerReadEnabled,
    serverPlannerWriteEnabled,
    serverCellMetadata,
    updateCurrentSchedule,
    refreshServerPlanner,
  });

  const {
    updateCell,
    fillOffAll,
    clearAll,
    isApplyingBulkSchedule,
  } = useScheduleMutations({
    serverPlannerWriteEnabled,
    serverPlannerStatus,
    serverCellMetadata,
    employees,
    rawSchedule,
    year,
    month,
    daysInMonth,
    updateCurrentSchedule,
    refreshServerPlanner,
  });

  const canBulkEditSchedule =
    canManagePlanner &&
    (!serverPlannerReadEnabled ||
      (serverPlannerWriteEnabled &&
        serverPlannerStatus === 'ready' &&
        !isApplyingBulkSchedule));

  const [isSavingFixedWeekdays, setIsSavingFixedWeekdays] = useState(false);
  const canPublishSchedule =
    serverPlannerWriteEnabled &&
    serverPlannerStatus === 'ready' &&
    departments.length > 0;
  const canSaveFixedWeekdays = serverPlannerWriteEnabled &&
    serverPlannerStatus === 'ready' &&
    departments.length > 0 &&
    employees.some((employee) => employee.scheduleMode === 'fixed-weekdays');

  const saveFixedWeekdays = async () => {
    if (!canSaveFixedWeekdays || isSavingFixedWeekdays) return;
    setIsSavingFixedWeekdays(true);
    try {
      const result = await saveFixedWeekdaysSchedule(
        year, month + 1, departments.map((department) => department.id)
      );
      await refreshServerPlanner();
      void showMessage(result.created > 0
        ? `График 5/2 сохранён. Добавлено смен: ${result.created}.`
        : 'График 5/2 уже сохранён на выбранный месяц.');
    } catch (error) {
      void showMessage(error instanceof Error
        ? `Не удалось сохранить график 5/2: ${error.message}`
        : 'Не удалось сохранить график 5/2.');
      await refreshServerPlanner();
    } finally {
      setIsSavingFixedWeekdays(false);
    }
  };

  const getEntry = useCallback(
    (empId: string, day: number): ShiftEntry => {
      return schedule[empId]?.[day] || { type: 'empty' };
    },
    [schedule]
  );

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

  const addEmployee = async (
    values: EmployeeCreateFormValues
  ): Promise<boolean> =>
    createEmployee({
      displayName: values.displayName,
      departmentId: values.departmentId,
      employmentRate: 1,
      scheduleMode: values.scheduleMode,
      fixedStartTime:
        values.scheduleMode === 'fixed-weekdays'
          ? values.fixedStartTime
          : null,
      fixedEndTime:
        values.scheduleMode === 'fixed-weekdays'
          ? values.fixedEndTime
          : null,
    });

  const saveEmployeeEdit = (values: EmployeeEditValues) => {
    if (!editingEmployeeId || mutatingEmployeeId !== null) return;

    const employeeId = editingEmployeeId;

    void updateEmployee(employeeId, {
      displayName: values.displayName,
      departmentId: values.departmentId,
      employmentRate: values.employmentRate,
      scheduleMode: values.scheduleMode,
      fixedStartTime: values.fixedStartTime,
      fixedEndTime: values.fixedEndTime,
    }).then((result) => {
      if (result !== 'blocked') {
        setEditingEmployeeId(null);
      }
    });
  };

  const removeEmployee = (id: string) => {
    const message = serverPlannerWriteEnabled
      ? 'Деактивировать сотрудника? Исторические смены будут сохранены.'
      : 'Удалить сотрудника, его смены и пожелания?';

    void confirmAction(message, {
      title: serverPlannerWriteEnabled
        ? 'Деактивация сотрудника'
        : 'Удаление сотрудника',
      confirmLabel: serverPlannerWriteEnabled
        ? 'Деактивировать'
        : 'Удалить',
    }).then((confirmed) => {
      if (!confirmed) return;

      void deactivateEmployee(id).then((result) => {
        if (result === 'blocked') return;
        if (wishEmployeeId === id) setWishEmployeeId(null);
        if (editingEmployeeId === id) setEditingEmployeeId(null);
      });
    });
  };

  const addDepartment = async () => {
    const name = newDepartmentName.trim();
    if (!name || mutatingDepartmentId !== null) return;

    const createdDepartmentId = await createDepartment({
      name,
      kind: 'general',
    });

    if (!createdDepartmentId) return;

    setNewDepartmentName('');
  };

  const renameDepartment = (department: Department) => {
    if (mutatingDepartmentId !== null) return;

    void promptText({
      title: 'Переименовать отдел',
      label: 'Название отдела',
      initialValue: department.name,
      confirmLabel: 'Сохранить',
    }).then((value) => {
      const nextName = value?.trim();
      if (!nextName || nextName === department.name) return;
      void renameDepartmentById(department.id, nextName);
    });
  };

  const removeDepartment = (departmentId: string) => {
    if (departments.length === 1) {
      void showMessage('Должен остаться хотя бы один отдел.', {
        title: 'Отдел нельзя деактивировать',
      });
      return;
    }

    if (employees.some((employee) => employee.departmentId === departmentId)) {
      void showMessage('Сначала перенесите сотрудников в другой отдел.', {
        title: 'Отдел нельзя деактивировать',
      });
      return;
    }

    void confirmAction('Деактивировать пустой отдел?', {
      title: 'Деактивация отдела',
      confirmLabel: 'Деактивировать',
    }).then((confirmed) => {
      if (!confirmed) return;
      void deactivateDepartment(departmentId);
    });
  };

  const toggleDepartmentCollapsed = (departmentId: string) => {
    setCollapsedDepartments((prev) =>
      prev.includes(departmentId)
        ? prev.filter((id) => id !== departmentId)
        : [...prev, departmentId]
    );
  };

  const navigateToValidationIssue = useCallback(
    (employeeId: string, date: string) => {
      const employee = employees.find((item) => item.id === employeeId);
      const day = Number(date.slice(8, 10));
      if (
        !employee ||
        !Number.isInteger(day) ||
        day < 1 ||
        day > daysInMonth
      ) {
        return;
      }

      setCollapsedDepartments((current) =>
        current.filter((departmentId) => departmentId !== employee.departmentId),
      );
      setEditingCell(null);
      setScheduleView('schedule');

      window.setTimeout(() => {
        const cell = document.getElementById(
          'schedule-cell-' + encodeURIComponent(employeeId) + '-' + day,
        );
        if (!(cell instanceof HTMLElement)) return;
        cell.scrollIntoView({ block: 'center', inline: 'center' });
        cell.focus({ preventScroll: true });
      }, 0);
    },
    [daysInMonth, employees],
  );

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
      const codePrefix = entry.shift.code ? entry.shift.code + ' ' : '';
      return codePrefix + entry.shift.start + '-' + entry.shift.end;
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

  const selectedWishEmployee =
    wishEmployeeId === null
      ? null
      : employees.find((employee) => employee.id === wishEmployeeId) || null;

  const selectedEditEmployee =
    editingEmployeeId === null
      ? null
      : employees.find((employee) => employee.id === editingEmployeeId) || null;

  const selectedShiftEmployee =
    editingCell === null
      ? null
      : employees.find((employee) => employee.id === editingCell.empId) || null;

  const draggedEmployee = activeDragId?.startsWith('emp:')
    ? employees.find((employee) => employee.id === activeDragId.slice(4)) || null
    : null;
  const draggedDepartment = activeDragId?.startsWith('dept:')
    ? departments.find((department) => department.id === activeDragId.slice(5)) || null
    : null;
  const dragTargetDepartment = dragTargetDepartmentId
    ? departments.find((department) => department.id === dragTargetDepartmentId) || null
    : null;

  const columnCount = daysInMonth + 5;

  return (
    <>
      <Page>
        <Container>
          <PlannerHeaderScreen
            themeMode={themeMode}
            onToggleTheme={toggleTheme}
            year={year}
            month={month}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            canManagePlanner={canManagePlanner}
            showHelp={showHelp}
            onToggleHelp={() => setShowHelp((value) => !value)}
            onCloseHelp={() => setShowHelp(false)}
            serverPlannerReadEnabled={serverPlannerReadEnabled}
            serverPlannerWriteEnabled={serverPlannerWriteEnabled}
            serverPlannerStatus={serverPlannerStatus}
            serverPlannerError={serverPlannerError}
          />

          <AppSectionNav />

          {canManagePlanner && (
            <PlannerManagementScreen
              departments={departments}
              year={year}
              monthIndex={month}
              publicationReadEnabled={serverPlannerReadEnabled}
              canPublishSchedule={canPublishSchedule}
              employees={employees}
              canCreateEmployee={canCreateEmployee}
              isCreatingEmployee={isCreatingEmployee}
              onAddEmployee={addEmployee}
              canManageDepartments={canManageDepartments}
              canViewDepartments={canManagePlanner}
              showDepartments={showDepartments}
              onToggleDepartments={() =>
                setShowDepartments((value) => !value)
              }
              scheduleView={scheduleView}
              onScheduleViewChange={(view) => {
                setEditingCell(null);
                setScheduleView(view);
              }}
              canImportExcel={canImportExcel}
              isImportingExcel={isImportingExcel}
              isApplyingExcelImport={isApplyingExcelImport}
              onExcelFile={handleExcelFile}
              excelRangeKey={excelRangeKey}
              onExcelRangeChange={setExcelRangeKey}
              isExportingExcel={isExportingExcel}
              onExportExcel={() => void handleExportExcel()}
              printRangeKey={printRangeKey}
              onPrintRangeChange={setPrintRangeKey}
              printCalendarWeekRanges={printCalendarWeekRanges}
              isPreparingPrint={isPreparingPrint}
              onPrint={() => void handlePrintSchedule()}
              canBulkEditSchedule={canBulkEditSchedule}
              canSaveFixedWeekdays={canSaveFixedWeekdays}
              isSavingFixedWeekdays={isSavingFixedWeekdays}
              onSaveFixedWeekdays={() => void saveFixedWeekdays()}
              isApplyingBulkSchedule={isApplyingBulkSchedule}
              onFillOffAll={() => void fillOffAll()}
              onClearAll={() => void clearAll()}
              onNavigateToValidationIssue={navigateToValidationIssue}
              newDepartmentName={newDepartmentName}
              onNewDepartmentNameChange={setNewDepartmentName}
              mutatingDepartmentId={mutatingDepartmentId}
              onAddDepartment={() => void addDepartment()}
              onRenameDepartment={renameDepartment}
              onRemoveDepartment={removeDepartment}
            />
          )}

          {canManagePlanner && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={clearDragState}
            onDragEnd={handleDragEnd}
          >
            <PlannerScheduleWorkspace
              departments={departments}
              employees={employees}
              daysInMonth={daysInMonth}
              year={year}
              month={month}
              schedule={schedule}
              periodKey={periodKey}
              wishes={wishes}
              scheduleView={scheduleView}
              onEditCell={setEditingCell}
              getEntry={getEntry}
              getEmployeeTotals={getEmployeeTotals}
              onRemoveEmployee={removeEmployee}
              onEditEmployee={setEditingEmployeeId}
              onOpenWishes={setWishEmployeeId}
              canEditWishes={canEditWishes}
              canManageEmployeeProfiles={canManageEmployeeProfiles}
              canEditScheduleCells={canEditScheduleCells}
              canMoveEmployees={canMoveEmployees}
              canMoveDepartments={canMoveDepartments}
              dragTargetDepartmentId={dragTargetDepartmentId}
              activeDragId={activeDragId}
              collapsedDepartments={collapsedDepartments}
              onToggleDepartmentCollapsed={toggleDepartmentCollapsed}
              grandTotals={grandTotals}
              draggedEmployee={draggedEmployee}
              draggedDepartment={draggedDepartment}
              dragTargetDepartment={dragTargetDepartment}
              printWeekRanges={printWeekRanges}
              onRateChange={changeEmployeeRate}
              canEditEmployeeRate={canEditEmployeeRate}
              updatingEmployeeRateId={updatingEmployeeRateId}
            />
          </DndContext>
          )}

          {!canManagePlanner && (
            <EmployeeSelfServiceCard>
              <PanelTitle>Личный кабинет сотрудника</PanelTitle>
              <EmployeeSelfServiceText>
                Здесь не показываются сводные часы, данные других сотрудников и
                инструменты изменения общего графика. Выберите нужный месяц и
                откройте «Мои смены» кнопкой с календарём в шапке.
              </EmployeeSelfServiceText>
            </EmployeeSelfServiceCard>
          )}

          <Footer>
            <div>
              {serverPlannerReadEnabled
                ? 'Данные загружаются с сервера • Смены и пожелания раздельно по месяцам'
                : 'Локальный demo-режим • Данные сохраняются только в этом браузере'}
            </div>
            <PoweredByLine>
              Powered by Anastasiya P.
              <Heart size={14} fill="currentColor" aria-hidden="true" />
            </PoweredByLine>
          </Footer>
        </Container>
      </Page>

      <PlannerOverlays
        canImportExcel={canImportExcel}
        excelImportPreview={excelImportPreview}
        excelImportConflictCount={excelImportConflictCount}
        overwriteExcelCells={overwriteExcelCells}
        onOverwriteExcelCellsChange={setOverwriteExcelCells}
        onApplyExcelImport={() => void applyExcelImport()}
        isApplyingExcelImport={isApplyingExcelImport}
        onCloseExcelImport={closeExcelImport}
        canEditScheduleCells={canEditScheduleCells}
        selectedShiftEmployee={selectedShiftEmployee}
        editingCell={editingCell}
        periodKey={periodKey}
        year={year}
        month={month}
        getEntry={getEntry}
        onSaveShift={(employeeId, day, value) => {
          updateCell(employeeId, day, value);
          setEditingCell(null);
        }}
        onCloseShift={() => setEditingCell(null)}
        selectedEditEmployee={selectedEditEmployee}
        canManageEmployeeProfiles={canManageEmployeeProfiles}
        departments={departments}
        mutatingEmployeeId={mutatingEmployeeId}
        onSaveEmployee={saveEmployeeEdit}
        onDeactivateEmployee={(employeeId) => removeEmployee(employeeId)}
        onCloseEmployee={() => setEditingEmployeeId(null)}
        canEditWishes={canEditWishes}
        selectedWishEmployee={selectedWishEmployee}
        daysInMonth={daysInMonth}
        selectedEmployeeWishes={
          selectedWishEmployee
            ? wishes[selectedWishEmployee.id]?.[periodKey] || []
            : []
        }
        mutatingWishId={mutatingWishId}
        onAddWish={(employeeId, wish) => addWish(employeeId, wish)}
        onRemoveWish={(employeeId, wishId) => removeWish(employeeId, wishId)}
        onCloseWishes={() => setWishEmployeeId(null)}
      />
    </>
  );
}

export default PlannerScreen;
