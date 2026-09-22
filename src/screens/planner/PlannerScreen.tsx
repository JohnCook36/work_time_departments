import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Global, ThemeProvider } from '@emotion/react';
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
  DepartmentKind,
  Employee,
  EmploymentRate,
  EmployeeScheduleMode,
  EmployeeWishesData,
  ScheduleData,
  SchedulePeriodsData,
  ShiftEntry,
} from '../../types';
import {
  calculateShiftHours,
  getDaysInMonth,
  validateShiftInput,
} from '../../utils';
import { EmployeeEditValues } from '../../EmployeeEditDrawer';
import {
  applyExcelImportEntries,
  ExcelImportPreview,
  parseScheduleExcel,
  resolveApplicableExcelImportEntries,
} from '../../importExcel';
import { exportScheduleToExcel } from '../../exportExcel';
import {
  getMonthWeekRanges,
  getRequiredPrintPeriods,
  getVisibleMonthWeekRanges,
  printSchedule,
} from '../../printSchedule';
import { hasManagementAccess, useAuthUser } from '../../auth/AuthContext';
import {
  applyPlannerScheduleChanges,
  buildScheduleCellChange,
  loadPlannerServerSnapshot,
  PlannerServerSnapshot,
} from '../../plannerApi';
import {
  buildEffectiveSchedule,
  buildEffectiveSchedulePeriods,
} from '../../employeeSchedule';
import { getTheme } from '../../theme';
import { useDepartmentManagement } from '../../hooks/useDepartmentManagement';
import { useEmployeeManagement } from '../../hooks/useEmployeeManagement';
import { usePlannerDnD } from '../../hooks/usePlannerDnD';
import { usePlannerServerSync } from '../../hooks/usePlannerServerSync';
import { usePlannerStorage } from '../../hooks/usePlannerStorage';
import { usePlannerWishes } from '../../hooks/usePlannerWishes';
import { useScheduleMutations } from '../../hooks/useScheduleMutations';
import { useThemeMode } from '../../hooks/useThemeMode';
import { PlannerHeaderScreen } from './PlannerHeaderScreen';
import { PlannerManagementScreen } from './PlannerManagementScreen';
import { PlannerOverlays } from './PlannerOverlays';
import { PlannerScheduleWorkspace } from './PlannerScheduleWorkspace';
import { ScheduleView } from './PlannerScheduleTable';
import {
  Card,
  Container,
  Footer,
  Muted,
  Page,
  PanelTitle,
} from '../../styles';

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
  const serverPlannerWriteEnabled =
    canManagePlanner && import.meta.env.VITE_SERVER_PLANNER_WRITE === '1';
  const serverPlannerReadEnabled =
    canManagePlanner &&
    (serverPlannerWriteEnabled ||
      import.meta.env.VITE_SERVER_PLANNER_READ === '1');
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
    usePlannerStorage(!serverPlannerReadEnabled);
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
  const [themeMode, setThemeMode] = useThemeMode();

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

  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeScheduleMode, setNewEmployeeScheduleMode] =
    useState<EmployeeScheduleMode>('flexible');
  const [newEmployeeFixedStartTime, setNewEmployeeFixedStartTime] =
    useState('');
  const [newEmployeeFixedEndTime, setNewEmployeeFixedEndTime] =
    useState('');
  const [newEmployeeDepartmentId, setNewEmployeeDepartmentId] = useState(
    serverPlannerReadEnabled
      ? ''
      : (stored?.departments || DEFAULT_DEPARTMENTS)[0].id
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
  const [wishEmployeeId, setWishEmployeeId] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(
    null
  );
  const [scheduleView, setScheduleView] = useState<ScheduleView>('schedule');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [isApplyingExcelImport, setIsApplyingExcelImport] = useState(false);
  const [excelImportPreview, setExcelImportPreview] =
    useState<ExcelImportPreview | null>(null);
  const [overwriteExcelCells, setOverwriteExcelCells] = useState(false);
  const [printRangeKey, setPrintRangeKey] = useState('month');
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

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
    changeDepartmentKind: changeDepartmentKindById,
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

  const theme = useMemo(() => getTheme(themeMode), [themeMode]);
  const periodKey = getPeriodKey(year, month);
  const rawSchedule = schedules[periodKey] || {};
  const schedule = useMemo(
    () => buildEffectiveSchedule(employees, rawSchedule, year, month),
    [employees, rawSchedule, year, month]
  );
  const effectiveSchedulePeriods = useMemo(
    () => buildEffectiveSchedulePeriods(employees, schedules, year, month),
    [employees, schedules, year, month]
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

  useEffect(() => {
    setPrintRangeKey('month');
  }, [year, month]);

  useEffect(() => {
    if (!departments.some((department) => department.id === newEmployeeDepartmentId)) {
      setNewEmployeeDepartmentId(departments[0]?.id || '');
    }
  }, [departments, newEmployeeDepartmentId]);

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

  const resetNewEmployeeForm = () => {
    setNewEmployeeName('');
    setNewEmployeeScheduleMode('flexible');
    setNewEmployeeFixedStartTime('');
    setNewEmployeeFixedEndTime('');
  };

  const addEmployee = async () => {
    const name = newEmployeeName.trim();
    if (!name || !newEmployeeDepartmentId || isCreatingEmployee) return;

    if (newEmployeeScheduleMode === 'fixed-weekdays') {
      const fixedEntry = validateShiftInput(
        newEmployeeFixedStartTime + '-' + newEmployeeFixedEndTime
      );

      if (fixedEntry.type !== 'shift') {
        alert('Для фиксированного графика укажите корректное время начала и окончания.');
        return;
      }
    }

    const created = await createEmployee({
      displayName: name,
      departmentId: newEmployeeDepartmentId,
      employmentRate: 1,
      scheduleMode: newEmployeeScheduleMode,
      fixedStartTime:
        newEmployeeScheduleMode === 'fixed-weekdays'
          ? newEmployeeFixedStartTime
          : null,
      fixedEndTime:
        newEmployeeScheduleMode === 'fixed-weekdays'
          ? newEmployeeFixedEndTime
          : null,
    });

    if (created) resetNewEmployeeForm();
  };

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
    const promptText = serverPlannerWriteEnabled
      ? 'Деактивировать сотрудника? Исторические смены будут сохранены.'
      : 'Удалить сотрудника, его смены и пожелания?';

    if (!confirm(promptText)) return;

    void deactivateEmployee(id).then((result) => {
      if (result === 'blocked') return;
      if (wishEmployeeId === id) setWishEmployeeId(null);
      if (editingEmployeeId === id) setEditingEmployeeId(null);
    });
  };

  const addDepartment = async () => {
    const name = newDepartmentName.trim();
    if (!name || mutatingDepartmentId !== null) return;

    const createdDepartmentId = await createDepartment({
      name,
      kind: newDepartmentKind,
    });

    if (!createdDepartmentId) return;

    setNewDepartmentName('');
    setNewDepartmentKind('general');
    setNewEmployeeDepartmentId(createdDepartmentId);
  };

  const renameDepartment = (department: Department) => {
    const nextName = prompt('Новое название отдела', department.name)?.trim();
    if (
      !nextName ||
      nextName === department.name ||
      mutatingDepartmentId !== null
    ) {
      return;
    }

    void renameDepartmentById(department.id, nextName);
  };

  const changeDepartmentKind = (
    departmentId: string,
    kind: DepartmentKind
  ) => {
    void changeDepartmentKindById(departmentId, kind);
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

    if (!confirm('Деактивировать пустой отдел?')) return;

    void deactivateDepartment(departmentId);
  };

  const toggleDepartmentCollapsed = (departmentId: string) => {
    setCollapsedDepartments((prev) =>
      prev.includes(departmentId)
        ? prev.filter((id) => id !== departmentId)
        : [...prev, departmentId]
    );
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

  const handleExportExcel = async () => {
    if (isExportingExcel) return;

    try {
      setIsExportingExcel(true);
      await exportScheduleToExcel({
        departments,
        employees,
        schedule,
        year,
        month,
        daysInMonth,
      });
    } catch (error) {
      console.error('Excel export failed', error);
      alert('Не удалось сформировать Excel-файл.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handlePrintSchedule = async () => {
    if (isPreparingPrint) return;

    let printPeriods = effectiveSchedulePeriods;

    if (serverPlannerReadEnabled) {
      try {
        setIsPreparingPrint(true);

        const requiredPeriods = getRequiredPrintPeriods(
          year,
          month,
          printRangeKey
        );
        const adjacentPeriods = requiredPeriods.filter(
          (period) => period.year !== year || period.month !== month
        );

        const adjacentSnapshots = await Promise.all(
          adjacentPeriods.map(async (period) => ({
            period,
            snapshot: await loadPlannerServerSnapshot(
              period.year,
              period.month + 1
            ),
          }))
        );

        const serverSchedules = {
          ...schedules,
          [periodKey]: rawSchedule,
        };

        adjacentSnapshots.forEach(({ period, snapshot }) => {
          serverSchedules[getPeriodKey(period.year, period.month)] =
            snapshot.schedule;
        });

        printPeriods = buildEffectiveSchedulePeriods(
          employees,
          serverSchedules,
          year,
          month
        );
      } catch (error) {
        console.error('Server print period preload failed', error);
        alert(
          'Не удалось загрузить соседние месяцы для печати. Попробуйте ещё раз.'
        );
        return;
      } finally {
        setIsPreparingPrint(false);
      }
    }

    printSchedule({
      departments,
      employees,
      schedule,
      schedules: printPeriods,
      year,
      month,
      daysInMonth,
      rangeKey: printRangeKey,
    });
  };

  const handleExcelFile = async (file: File | null) => {
    if (!file || isImportingExcel) return;

    try {
      setIsImportingExcel(true);
      const preview = await parseScheduleExcel(file, employees);
      setOverwriteExcelCells(false);
      setExcelImportPreview(preview);
    } catch (error) {
      console.error('Excel import failed', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Не удалось прочитать Excel-файл.'
      );
    } finally {
      setIsImportingExcel(false);
    }
  };

  const excelImportConflictCount = useMemo(() => {
    if (!excelImportPreview) return 0;

    return excelImportPreview.entries.reduce((count, item) => {
      if (!item.employeeId || item.day > daysInMonth) return count;
      const existing = schedule[item.employeeId]?.[item.day];
      return existing && existing.type !== 'empty' ? count + 1 : count;
    }, 0);
  }, [excelImportPreview, schedule, daysInMonth]);

  const applyExcelImport = async () => {
    if (!excelImportPreview || isApplyingExcelImport) return;

    const options = {
      currentSchedule: rawSchedule,
      protectedSchedule: schedule,
      entries: excelImportPreview.entries,
      daysInMonth,
      overwriteExisting: overwriteExcelCells,
    };

    const result = applyExcelImportEntries(options);

    const details = [
      'Импортировано смен: ' + result.applied,
      result.skippedProtected > 0
        ? 'Защищено заполненных ячеек: ' + result.skippedProtected
        : null,
      result.skippedOutsideMonth > 0
        ? 'Пропущено дней вне текущего месяца: ' + result.skippedOutsideMonth
        : null,
    ].filter(Boolean);

    if (!serverPlannerWriteEnabled) {
      updateCurrentSchedule(() => result.schedule);
      setExcelImportPreview(null);
      setOverwriteExcelCells(false);
      alert(details.join('\n'));
      return;
    }

    const resolved = resolveApplicableExcelImportEntries(options);

    if (resolved.entries.length === 0) {
      setExcelImportPreview(null);
      setOverwriteExcelCells(false);
      alert(details.join('\n'));
      return;
    }

    let changes: ReturnType<typeof buildScheduleCellChange>[];
    try {
      changes = resolved.entries.map((item) => {
        if (!item.employeeId) {
          throw new Error('Excel import contains an unresolved Employee');
        }

        const entry = validateShiftInput(item.value);
        if (entry.type !== 'shift' && entry.type !== 'off') {
          throw new Error(
            'Excel import contains a schedule value that cannot be persisted'
          );
        }

        return buildScheduleCellChange(
          item.employeeId,
          item.day,
          entry,
          serverCellMetadata[item.employeeId]?.[item.day]
        );
      });
    } catch (error) {
      alert(
        error instanceof Error
          ? 'Не удалось подготовить импорт: ' + error.message
          : 'Не удалось подготовить импорт для сервера.'
      );
      await refreshServerPlanner();
      return;
    }

    try {
      setIsApplyingExcelImport(true);
      await applyPlannerScheduleChanges(
        year,
        month + 1,
        changes
      );
      setExcelImportPreview(null);
      setOverwriteExcelCells(false);
      await refreshServerPlanner();
      alert(details.join('\n'));
    } catch (error) {
      console.error('Server Excel import failed', error);
      alert(
        error instanceof Error
          ? 'Не удалось применить импорт: ' + error.message
          : 'Не удалось применить импорт на сервере.'
      );
      await refreshServerPlanner();
    } finally {
      setIsApplyingExcelImport(false);
    }
  };

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
    <ThemeProvider theme={theme}>
      <Global
        styles={(activeTheme) => ({
          '*': { boxSizing: 'border-box' },
          html: { colorScheme: activeTheme.mode },
          body: {
            margin: 0,
            minWidth: 320,
            fontFamily:
              'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            background: activeTheme.colors.background,
            color: activeTheme.colors.text,
          },
          button: { fontFamily: 'inherit' },
          input: { fontFamily: 'inherit' },
          select: { fontFamily: 'inherit' },
          textarea: { fontFamily: 'inherit' },
        })}
      />

      <Page>
        <Container>
          <PlannerHeaderScreen
            themeMode={themeMode}
            onToggleTheme={() =>
              setThemeMode((value) => (value === 'light' ? 'dark' : 'light'))
            }
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

          {canManagePlanner && (
            <PlannerManagementScreen
              newEmployeeName={newEmployeeName}
              onNewEmployeeNameChange={setNewEmployeeName}
              newEmployeeDepartmentId={newEmployeeDepartmentId}
              onNewEmployeeDepartmentChange={setNewEmployeeDepartmentId}
              newEmployeeScheduleMode={newEmployeeScheduleMode}
              onNewEmployeeScheduleModeChange={setNewEmployeeScheduleMode}
              newEmployeeFixedStartTime={newEmployeeFixedStartTime}
              onNewEmployeeFixedStartTimeChange={setNewEmployeeFixedStartTime}
              newEmployeeFixedEndTime={newEmployeeFixedEndTime}
              onNewEmployeeFixedEndTimeChange={setNewEmployeeFixedEndTime}
              departments={departments}
              employees={employees}
              canCreateEmployee={canCreateEmployee}
              isCreatingEmployee={isCreatingEmployee}
              onAddEmployee={() => void addEmployee()}
              canManageDepartments={canManageDepartments}
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
              isExportingExcel={isExportingExcel}
              onExportExcel={() => void handleExportExcel()}
              printRangeKey={printRangeKey}
              onPrintRangeChange={setPrintRangeKey}
              printCalendarWeekRanges={printCalendarWeekRanges}
              isPreparingPrint={isPreparingPrint}
              onPrint={() => void handlePrintSchedule()}
              canBulkEditSchedule={canBulkEditSchedule}
              isApplyingBulkSchedule={isApplyingBulkSchedule}
              onFillOffAll={() => void fillOffAll()}
              onClearAll={() => void clearAll()}
              newDepartmentName={newDepartmentName}
              onNewDepartmentNameChange={setNewDepartmentName}
              newDepartmentKind={newDepartmentKind}
              onNewDepartmentKindChange={setNewDepartmentKind}
              mutatingDepartmentId={mutatingDepartmentId}
              onAddDepartment={() => void addDepartment()}
              onChangeDepartmentKind={changeDepartmentKind}
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
            <Card style={{ marginTop: 14, padding: 22 }}>
              <PanelTitle>Личный кабинет сотрудника</PanelTitle>
              <Muted style={{ marginTop: 6 }}>
                Здесь не показываются сводные часы, данные других сотрудников и
                инструменты изменения общего графика. Выберите нужный месяц и
                откройте «Мои смены» кнопкой с календарём в шапке.
              </Muted>
            </Card>
          )}

          <Footer>
            <div>
              Данные сохраняются локально в браузере • Смены и пожелания раздельно
              по месяцам
            </div>
            <div
              style={{
                marginTop: 6,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              Powered by Anastasiya P.
              <Heart size={14} fill="currentColor" aria-hidden="true" />
            </div>
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
        onCloseExcelImport={() => {
          setExcelImportPreview(null);
          setOverwriteExcelCells(false);
        }}
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
    </ThemeProvider>
  );
}

export default PlannerScreen;
