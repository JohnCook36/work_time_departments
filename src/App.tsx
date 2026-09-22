import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Global, ThemeProvider } from '@emotion/react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileUp,
  GripVertical,
  Heart,
  Info,
  Layers3,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
  Printer,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  Department,
  DepartmentKind,
  Employee,
  EmploymentRate,
  EmployeeScheduleMode,
  EmployeeWish,
  EmployeeWishesData,
  ScheduleData,
  SchedulePeriodsData,
  ShiftEntry,
} from './types';
import {
  calculateShiftHours,
  DAY_NAMES_SHORT,
  getDayOfWeek,
  getDaysInMonth,
  MONTH_NAMES,
  validateShiftInput,
} from './utils';
import { EmployeeWishDrawer } from './WishDrawer';
import {
  EmployeeEditDrawer,
  EmployeeEditValues,
} from './EmployeeEditDrawer';
import { ExcelImportDrawer } from './ExcelImportDrawer';
import {
  applyExcelImportEntries,
  ExcelImportPreview,
  parseScheduleExcel,
} from './importExcel';
import { exportScheduleToExcel } from './exportExcel';
import {
  getMonthWeekRanges,
  getVisibleMonthWeekRanges,
  printSchedule,
} from './printSchedule';
import { ShiftEditor } from './ShiftEditor';
import { WeeklyHoursPanel } from './WeeklyHoursPanel';
import { AdminOnboardingPanel } from './auth/AdminOnboardingPanel';
import { MySchedulePanel } from './auth/MySchedulePanel';
import { hasManagementAccess, useAuthUser } from './auth/AuthContext';
import {
  applyDepartmentScheduleChanges,
  applyManageableScheduleChanges,
  buildDepartmentReorderInput,
  buildEmployeeMoveInput,
  buildEmployeeReorderInput,
  buildScheduleCellChange,
  createPlannerDepartment,
  createPlannerEmployee,
  createPlannerWish,
  deactivatePlannerDepartment,
  deactivatePlannerEmployee,
  deletePlannerWish,
  loadPlannerServerSnapshot,
  PlannerCellMetadataMap,
  PlannerDepartmentMetadataMap,
  PlannerEmployeeMetadataMap,
  ScheduleCellChange,
  reorderPlannerDepartments,
  reorderPlannerEmployees,
  updatePlannerDepartment,
  updatePlannerEmployee,
} from './plannerApi';
import {
  buildEffectiveSchedule,
  buildEffectiveSchedulePeriods,
} from './employeeSchedule';
import { getTheme, ThemeMode } from './theme';
import {
  ActionButton,
  BrandBlock,
  BrandTitle,
  Card,
  Container,
  ControlsCard,
  ControlsRow,
  DepartmentBadge,
  DepartmentCard,
  DepartmentGrid,
  DepartmentMeta,
  DepartmentName,
  DepartmentPanel,
  DepartmentRowCell,
  DepartmentRowInner,
  Divider,
  EmployeeCell,
  EmployeeCellInner,
  EmployeeNameText,
  EmployeeRow,
  ErrorCard,
  Footer,
  HeaderActions,
  HeaderCard,
  HeaderCell,
  HeaderLeft,
  HeaderRow,
  HelpCard,
  HelpGrid,
  IconButton,
  Legend,
  MetricCell,
  MonthLabel,
  Muted,
  Page,
  PanelTitle,
  PanelTitleRow,
  RowIconButton,
  ScheduleTable,
  Select,
  ShiftCell,
  ShiftDisplay,
  StickyHeaderCell,
  StickyTotalCell,
  TableHeadRow,
  TableScroll,
  TableShell,
  TextInput,
  ThemeButton,
  TinyText,
  TotalCell,
  TotalRow,
  WishCount,
  DragHandle,
} from './styles';

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function getPeriodKey(year: number, month: number): string {
  return year + '-' + String(month + 1).padStart(2, '0');
}

type ScheduleView = 'schedule' | 'hours';

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
const THEME_KEY = 'hotel-shift-planner-theme';

interface StoredData {
  employees?: Array<Employee | Omit<Employee, 'departmentId'>>;
  departments?: Department[];
  schedule?: ScheduleData;
  schedules?: SchedulePeriodsData;
  wishes?: EmployeeWishesData;
  collapsedDepartments?: string[];
}

interface LoadedData {
  employees: Employee[];
  departments: Department[];
  schedules: SchedulePeriodsData;
  wishes: EmployeeWishesData;
  collapsedDepartments: string[];
}

function loadFromStorage(initialPeriodKey: string): LoadedData | null {
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
          employmentRate:
            employee.employmentRate === 0.5 ||
            employee.employmentRate === 0.75 ||
            employee.employmentRate === 1
              ? employee.employmentRate
              : 1,
          scheduleMode:
            employee.scheduleMode === 'fixed-weekdays'
              ? ('fixed-weekdays' as const)
              : ('flexible' as const),
          fixedStartTime:
            employee.scheduleMode === 'fixed-weekdays' &&
            typeof employee.fixedStartTime === 'string'
              ? employee.fixedStartTime
              : undefined,
          fixedEndTime:
            employee.scheduleMode === 'fixed-weekdays' &&
            typeof employee.fixedEndTime === 'string'
              ? employee.fixedEndTime
              : undefined,
        }))
      : DEFAULT_EMPLOYEES.map((employee) => ({
          ...employee,
          employmentRate: employee.employmentRate || 1,
          scheduleMode: employee.scheduleMode || 'flexible',
        }));

    const schedules =
      data.schedules ||
      (data.schedule ? { [initialPeriodKey]: data.schedule } : {});

    return {
      employees,
      departments,
      schedules,
      wishes: data.wishes || {},
      collapsedDepartments: Array.isArray(data.collapsedDepartments)
        ? data.collapsedDepartments.filter((id) =>
            departments.some((department) => department.id === id)
          )
        : [],
    };
  } catch {
    return null;
  }
}

function saveToStorage(
  employees: Employee[],
  departments: Department[],
  schedules: SchedulePeriodsData,
  wishes: EmployeeWishesData,
  collapsedDepartments: string[]
) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        employees,
        departments,
        schedules,
        wishes,
        collapsedDepartments,
      })
    );
  } catch {
    // Browser storage may be unavailable.
  }
}

function loadThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore
  }

  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }

  return 'light';
}

function departmentKindLabel(kind: DepartmentKind): string {
  if (kind === 'fo') return 'FO';
  if (kind === 'night') return 'Night';
  return 'Отдел';
}

function App() {
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
  const stored = useMemo(() => loadFromStorage(initialPeriodKey), [initialPeriodKey]);

  const [year, setYear] = useState(initialNow.getFullYear());
  const [month, setMonth] = useState(initialNow.getMonth());
  const [themeMode, setThemeMode] = useState<ThemeMode>(loadThemeMode);

  const [departments, setDepartments] = useState<Department[]>(
    stored?.departments || DEFAULT_DEPARTMENTS
  );
  const [employees, setEmployees] = useState<Employee[]>(
    stored?.employees || DEFAULT_EMPLOYEES
  );
  const [schedules, setSchedules] = useState<SchedulePeriodsData>(
    stored?.schedules || {}
  );
  const [wishes, setWishes] = useState<EmployeeWishesData>(
    stored?.wishes || {}
  );
  const [collapsedDepartments, setCollapsedDepartments] = useState<string[]>(
    stored?.collapsedDepartments || []
  );

  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeScheduleMode, setNewEmployeeScheduleMode] =
    useState<EmployeeScheduleMode>('flexible');
  const [newEmployeeFixedStartTime, setNewEmployeeFixedStartTime] =
    useState('');
  const [newEmployeeFixedEndTime, setNewEmployeeFixedEndTime] =
    useState('');
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
  const [wishEmployeeId, setWishEmployeeId] = useState<string | null>(null);
  const [mutatingWishId, setMutatingWishId] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(
    null
  );
  const [scheduleView, setScheduleView] = useState<ScheduleView>('schedule');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [isBulkWriting, setIsBulkWriting] = useState(false);
  const [isCreatingEmployee, setIsCreatingEmployee] = useState(false);
  const [excelImportPreview, setExcelImportPreview] =
    useState<ExcelImportPreview | null>(null);
  const [overwriteExcelCells, setOverwriteExcelCells] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [printRangeKey, setPrintRangeKey] = useState('month');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragTargetDepartmentId, setDragTargetDepartmentId] = useState<string | null>(null);
  const [serverPlannerStatus, setServerPlannerStatus] = useState<
    'disabled' | 'loading' | 'ready' | 'error'
  >(serverPlannerReadEnabled ? 'loading' : 'disabled');
  const [serverPlannerError, setServerPlannerError] = useState<string | null>(
    null
  );
  const [serverCellMetadata, setServerCellMetadata] =
    useState<PlannerCellMetadataMap>({});
  const [serverEmployeeMetadata, setServerEmployeeMetadata] =
    useState<PlannerEmployeeMetadataMap>({});
  const [serverDepartmentMetadata, setServerDepartmentMetadata] =
    useState<PlannerDepartmentMetadataMap>({});
  const [updatingEmployeeRateId, setUpdatingEmployeeRateId] =
    useState<string | null>(null);
  const [mutatingEmployeeId, setMutatingEmployeeId] =
    useState<string | null>(null);
  const [movingEmployeeId, setMovingEmployeeId] =
    useState<string | null>(null);
  const [movingDepartmentId, setMovingDepartmentId] =
    useState<string | null>(null);
  const [mutatingDepartmentId, setMutatingDepartmentId] =
    useState<string | null>(null);
  const serverPlannerLoadVersion = useRef(0);

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
  const canEditBulkSchedule =
    canManagePlanner &&
    (!serverPlannerReadEnabled ||
      (serverPlannerWriteEnabled &&
        serverPlannerStatus === 'ready' &&
        !isBulkWriting));
  const canEditEmployeeRate =
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
    saveToStorage(
      employees,
      departments,
      schedules,
      wishes,
      collapsedDepartments
    );
  }, [employees, departments, schedules, wishes, collapsedDepartments]);

  const refreshServerPlanner = useCallback(async () => {
    const loadVersion = ++serverPlannerLoadVersion.current;
    setServerPlannerStatus('loading');
    setServerPlannerError(null);

    try {
      const snapshot = await loadPlannerServerSnapshot(year, month + 1);
      if (loadVersion !== serverPlannerLoadVersion.current) return;

      setDepartments(snapshot.departments);
      setEmployees(snapshot.employees);
      setSchedules((prev) => ({
        ...prev,
        [periodKey]: snapshot.schedule,
      }));
      setWishes(snapshot.wishes);
      setServerCellMetadata(snapshot.cellMetadata);
      setServerEmployeeMetadata(snapshot.employeeMetadata);
      setServerDepartmentMetadata(snapshot.departmentMetadata);
      setServerPlannerStatus('ready');
    } catch (error) {
      if (loadVersion !== serverPlannerLoadVersion.current) return;

      console.error('Server planner load failed', error);
      setServerPlannerStatus('error');
      setServerPlannerError(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить график с сервера.'
      );
    }
  }, [year, month, periodKey]);

  useEffect(() => {
    if (!serverPlannerReadEnabled) {
      serverPlannerLoadVersion.current++;
      setServerPlannerStatus('disabled');
      setServerPlannerError(null);
      setServerCellMetadata({});
      setServerEmployeeMetadata({});
      setServerDepartmentMetadata({});
      setUpdatingEmployeeRateId(null);
      setMutatingEmployeeId(null);
      setEditingEmployeeId(null);
      setMutatingWishId(null);
      setIsBulkWriting(false);
      setMovingEmployeeId(null);
      setMovingDepartmentId(null);
      setMutatingDepartmentId(null);
      return;
    }

    setEditingCell(null);
    setWishEmployeeId(null);
    void refreshServerPlanner();

    return () => {
      serverPlannerLoadVersion.current++;
    };
  }, [serverPlannerReadEnabled, refreshServerPlanner]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, themeMode);
    } catch {
      // ignore
    }
  }, [themeMode]);

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

  const getEntry = useCallback(
    (empId: string, day: number): ShiftEntry => {
      return schedule[empId]?.[day] || { type: 'empty' };
    },
    [schedule]
  );

  const updateCell = useCallback(
    (empId: string, day: number, value: string) => {
      const entry = validateShiftInput(value);

      if (!serverPlannerWriteEnabled) {
        updateCurrentSchedule((current) => ({
          ...current,
          [empId]: {
            ...(current[empId] || {}),
            [day]: entry,
          },
        }));
        return;
      }

      if (entry.type === 'error') {
        alert(entry.error || 'Некорректная смена.');
        return;
      }

      if (serverPlannerStatus !== 'ready') {
        alert('График ещё не синхронизирован с сервером.');
        return;
      }

      const employee = employees.find((item) => item.id === empId);
      if (!employee) {
        alert('Сотрудник не найден в серверном графике.');
        void refreshServerPlanner();
        return;
      }

      const change = buildScheduleCellChange(
        empId,
        day,
        entry,
        serverCellMetadata[empId]?.[day]
      );

      updateCurrentSchedule((current) => ({
        ...current,
        [empId]: {
          ...(current[empId] || {}),
          [day]: entry,
        },
      }));

      void applyDepartmentScheduleChanges(
        employee.departmentId,
        year,
        month + 1,
        [change]
      )
        .then(() => refreshServerPlanner())
        .catch((error) => {
          console.error('Server planner write failed', error);
          alert(
            error instanceof Error
              ? 'Не удалось сохранить смену: ' + error.message
              : 'Не удалось сохранить смену на сервере.'
          );
          void refreshServerPlanner();
        });
    },
    [
      employees,
      month,
      refreshServerPlanner,
      serverCellMetadata,
      serverPlannerStatus,
      serverPlannerWriteEnabled,
      updateCurrentSchedule,
      year,
    ]
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

    if (!serverPlannerWriteEnabled) {
      setEmployees((prev) => [
        ...prev,
        {
          id: generateId(),
          name,
          departmentId: newEmployeeDepartmentId,
          employmentRate: 1,
          scheduleMode: newEmployeeScheduleMode,
          ...(newEmployeeScheduleMode === 'fixed-weekdays'
            ? {
                fixedStartTime: newEmployeeFixedStartTime,
                fixedEndTime: newEmployeeFixedEndTime,
              }
            : {}),
        },
      ]);
      resetNewEmployeeForm();
      return;
    }

    if (serverPlannerStatus !== 'ready') {
      alert('График ещё не синхронизирован с сервером.');
      return;
    }

    try {
      setIsCreatingEmployee(true);
      await createPlannerEmployee({
        displayName: name,
        departmentId: newEmployeeDepartmentId,
        employmentRate: 1,
        scheduleMode:
          newEmployeeScheduleMode === 'fixed-weekdays'
            ? 'FIXED_WEEKDAYS'
            : 'FLEXIBLE',
        ...(newEmployeeScheduleMode === 'fixed-weekdays'
          ? {
              fixedStartTime: newEmployeeFixedStartTime,
              fixedEndTime: newEmployeeFixedEndTime,
            }
          : {
              fixedStartTime: null,
              fixedEndTime: null,
            }),
      });
      resetNewEmployeeForm();
      await refreshServerPlanner();
    } catch (error) {
      console.error('Server employee create failed', error);
      alert(
        error instanceof Error
          ? 'Не удалось добавить сотрудника: ' + error.message
          : 'Не удалось добавить сотрудника на сервере.'
      );
      await refreshServerPlanner();
    } finally {
      setIsCreatingEmployee(false);
    }
  };

  const changeEmployeeRate = (
    employeeId: string,
    employmentRate: EmploymentRate
  ) => {
    if (!serverPlannerWriteEnabled) {
      setEmployees((prev) =>
        prev.map((employee) =>
          employee.id === employeeId
            ? { ...employee, employmentRate }
            : employee
        )
      );
      return;
    }

    if (serverPlannerStatus !== 'ready' || updatingEmployeeRateId !== null) {
      alert('График ещё не готов к изменению ставки.');
      return;
    }

    const metadata = serverEmployeeMetadata[employeeId];
    if (!metadata) {
      alert('Не удалось определить версию сотрудника. Обновляю данные.');
      void refreshServerPlanner();
      return;
    }

    setUpdatingEmployeeRateId(employeeId);
    void updatePlannerEmployee(employeeId, {
      employmentRate,
      expectedUpdatedAt: metadata.updatedAt,
    })
      .then(() => refreshServerPlanner())
      .catch((error) => {
        console.error('Server employee rate update failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось изменить ставку: ' + error.message
            : 'Не удалось изменить ставку сотрудника на сервере.'
        );
        void refreshServerPlanner();
      })
      .finally(() => {
        setUpdatingEmployeeRateId(null);
      });
  };

  const saveEmployeeEdit = (values: EmployeeEditValues) => {
    if (!editingEmployeeId || mutatingEmployeeId !== null) return;

    const employeeId = editingEmployeeId;

    if (!serverPlannerWriteEnabled) {
      setEmployees((prev) =>
        prev.map((employee) =>
          employee.id === employeeId
            ? {
                ...employee,
                name: values.displayName,
                departmentId: values.departmentId,
                employmentRate: values.employmentRate,
                scheduleMode: values.scheduleMode,
                ...(values.scheduleMode === 'fixed-weekdays'
                  ? {
                      fixedStartTime: values.fixedStartTime || undefined,
                      fixedEndTime: values.fixedEndTime || undefined,
                    }
                  : {
                      fixedStartTime: undefined,
                      fixedEndTime: undefined,
                    }),
              }
            : employee
        )
      );
      setEditingEmployeeId(null);
      return;
    }

    if (serverPlannerStatus !== 'ready') {
      alert('График ещё не готов к редактированию сотрудника.');
      return;
    }

    const metadata = serverEmployeeMetadata[employeeId];
    if (!metadata) {
      alert('Не удалось определить версию сотрудника. Обновляю данные.');
      setEditingEmployeeId(null);
      void refreshServerPlanner();
      return;
    }

    setMutatingEmployeeId(employeeId);
    void updatePlannerEmployee(employeeId, {
      displayName: values.displayName,
      departmentId: values.departmentId,
      employmentRate: values.employmentRate,
      scheduleMode:
        values.scheduleMode === 'fixed-weekdays'
          ? 'FIXED_WEEKDAYS'
          : 'FLEXIBLE',
      fixedStartTime: values.fixedStartTime,
      fixedEndTime: values.fixedEndTime,
      expectedUpdatedAt: metadata.updatedAt,
    })
      .then(async () => {
        setEditingEmployeeId(null);
        await refreshServerPlanner();
      })
      .catch((error) => {
        console.error('Server employee edit failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось изменить сотрудника: ' + error.message
            : 'Не удалось изменить сотрудника на сервере.'
        );
        setEditingEmployeeId(null);
        void refreshServerPlanner();
      })
      .finally(() => {
        setMutatingEmployeeId(null);
      });
  };

  const removeEmployee = (id: string) => {
    const promptText = serverPlannerWriteEnabled
      ? 'Деактивировать сотрудника? Исторические смены будут сохранены.'
      : 'Удалить сотрудника, его смены и пожелания?';

    if (!confirm(promptText)) return;

    if (!serverPlannerWriteEnabled) {
      setEmployees((prev) => prev.filter((employee) => employee.id !== id));
      setSchedules((prev) => {
        const next: SchedulePeriodsData = {};
        Object.entries(prev).forEach(([key, periodSchedule]) => {
          const periodNext = { ...periodSchedule };
          delete periodNext[id];
          next[key] = periodNext;
        });
        return next;
      });
      setWishes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (wishEmployeeId === id) setWishEmployeeId(null);
      if (editingEmployeeId === id) setEditingEmployeeId(null);
      return;
    }

    if (
      serverPlannerStatus !== 'ready' ||
      mutatingEmployeeId !== null
    ) {
      alert('График ещё не готов к деактивации сотрудника.');
      return;
    }

    const metadata = serverEmployeeMetadata[id];
    if (!metadata) {
      alert('Не удалось определить версию сотрудника. Обновляю данные.');
      setEditingEmployeeId(null);
      void refreshServerPlanner();
      return;
    }

    setMutatingEmployeeId(id);
    void deactivatePlannerEmployee(id, metadata.updatedAt)
      .then(async () => {
        if (wishEmployeeId === id) setWishEmployeeId(null);
        if (editingEmployeeId === id) setEditingEmployeeId(null);
        await refreshServerPlanner();
      })
      .catch((error) => {
        console.error('Server employee deactivate failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось деактивировать сотрудника: ' + error.message
            : 'Не удалось деактивировать сотрудника на сервере.'
        );
        setEditingEmployeeId(null);
        void refreshServerPlanner();
      })
      .finally(() => {
        setMutatingEmployeeId(null);
      });
  };

  const addDepartment = async () => {
    const name = newDepartmentName.trim();
    if (!name || mutatingDepartmentId !== null) return;

    if (!serverPlannerWriteEnabled) {
      const department: Department = {
        id: generateId(),
        name,
        kind: newDepartmentKind,
      };

      setDepartments((prev) => [...prev, department]);
      setNewEmployeeDepartmentId(department.id);
      setNewDepartmentName('');
      setNewDepartmentKind('general');
      return;
    }

    if (!canManageDepartments) {
      alert('Управление отделами сейчас недоступно.');
      return;
    }

    try {
      setMutatingDepartmentId('create');
      const created = await createPlannerDepartment({
        name,
        kind: newDepartmentKind,
      });
      setNewDepartmentName('');
      setNewDepartmentKind('general');
      await refreshServerPlanner();
      setNewEmployeeDepartmentId(created.id);
    } catch (error) {
      console.error('Server department create failed', error);
      alert(
        error instanceof Error
          ? 'Не удалось создать отдел: ' + error.message
          : 'Не удалось создать отдел на сервере.'
      );
      await refreshServerPlanner();
    } finally {
      setMutatingDepartmentId(null);
    }
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

    if (!serverPlannerWriteEnabled) {
      setDepartments((prev) =>
        prev.map((item) =>
          item.id === department.id ? { ...item, name: nextName } : item
        )
      );
      return;
    }

    if (!canManageDepartments) {
      alert('Управление отделами сейчас недоступно.');
      return;
    }

    const metadata = serverDepartmentMetadata[department.id];
    if (!metadata) {
      alert('Не удалось определить версию отдела. Обновляю данные.');
      void refreshServerPlanner();
      return;
    }

    setMutatingDepartmentId(department.id);
    void updatePlannerDepartment(department.id, {
      name: nextName,
      expectedUpdatedAt: metadata.updatedAt,
    })
      .then(() => refreshServerPlanner())
      .catch((error) => {
        console.error('Server department rename failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось переименовать отдел: ' + error.message
            : 'Не удалось переименовать отдел на сервере.'
        );
        void refreshServerPlanner();
      })
      .finally(() => {
        setMutatingDepartmentId(null);
      });
  };

  const changeDepartmentKind = (
    departmentId: string,
    kind: DepartmentKind
  ) => {
    if (mutatingDepartmentId !== null) return;

    if (!serverPlannerWriteEnabled) {
      setDepartments((prev) =>
        prev.map((department) =>
          department.id === departmentId ? { ...department, kind } : department
        )
      );
      return;
    }

    if (!canManageDepartments) {
      alert('Управление отделами сейчас недоступно.');
      return;
    }

    const metadata = serverDepartmentMetadata[departmentId];
    if (!metadata) {
      alert('Не удалось определить версию отдела. Обновляю данные.');
      void refreshServerPlanner();
      return;
    }

    setMutatingDepartmentId(departmentId);
    void updatePlannerDepartment(departmentId, {
      kind,
      expectedUpdatedAt: metadata.updatedAt,
    })
      .then(() => refreshServerPlanner())
      .catch((error) => {
        console.error('Server department kind update failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось изменить тип отдела: ' + error.message
            : 'Не удалось изменить тип отдела на сервере.'
        );
        void refreshServerPlanner();
      })
      .finally(() => {
        setMutatingDepartmentId(null);
      });
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

    if (!serverPlannerWriteEnabled) {
      setDepartments((prev) =>
        prev.filter((department) => department.id !== departmentId)
      );
      setCollapsedDepartments((prev) =>
        prev.filter((id) => id !== departmentId)
      );
      return;
    }

    if (!canManageDepartments || mutatingDepartmentId !== null) {
      alert('Управление отделами сейчас недоступно.');
      return;
    }

    const metadata = serverDepartmentMetadata[departmentId];
    if (!metadata) {
      alert('Не удалось определить версию отдела. Обновляю данные.');
      void refreshServerPlanner();
      return;
    }

    setMutatingDepartmentId(departmentId);
    void deactivatePlannerDepartment(departmentId, metadata.updatedAt)
      .then(async () => {
        setCollapsedDepartments((prev) =>
          prev.filter((id) => id !== departmentId)
        );
        await refreshServerPlanner();
      })
      .catch((error) => {
        console.error('Server department deactivate failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось деактивировать отдел: ' + error.message
            : 'Не удалось деактивировать отдел на сервере.'
        );
        void refreshServerPlanner();
      })
      .finally(() => {
        setMutatingDepartmentId(null);
      });
  };

  const toggleDepartmentCollapsed = (departmentId: string) => {
    setCollapsedDepartments((prev) =>
      prev.includes(departmentId)
        ? prev.filter((id) => id !== departmentId)
        : [...prev, departmentId]
    );
  };

  const resolveTargetDepartmentId = useCallback(
    (overRaw: string): string | null => {
      if (overRaw.startsWith('dep:')) return overRaw.slice(4);
      if (overRaw.startsWith('dept:')) return overRaw.slice(5);
      if (overRaw.startsWith('emp:')) {
        const overEmployeeId = overRaw.slice(4);
        return (
          employees.find((employee) => employee.id === overEmployeeId)
            ?.departmentId || null
        );
      }
      return null;
    },
    [employees]
  );

  const clearDragState = () => {
    setActiveDragId(null);
    setDragTargetDepartmentId(null);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDragId(String(active.id));
    setDragTargetDepartmentId(null);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const activeRaw = String(active.id);
    if (!over || !activeRaw.startsWith('emp:')) {
      setDragTargetDepartmentId(null);
      return;
    }

    setDragTargetDepartmentId(
      resolveTargetDepartmentId(String(over.id))
    );
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    clearDragState();
    if (!over) return;

    const activeRaw = String(active.id);
    const overRaw = String(over.id);

    if (activeRaw.startsWith('dept:')) {
      const activeDepartmentId = activeRaw.slice(5);
      const overEmployeeId = overRaw.startsWith('emp:') ? overRaw.slice(4) : null;
      const targetDepartmentId = overRaw.startsWith('dept:')
        ? overRaw.slice(5)
        : overRaw.startsWith('dep:')
          ? overRaw.slice(4)
          : overEmployeeId
            ? employees.find((employee) => employee.id === overEmployeeId)?.departmentId
            : undefined;

      if (!targetDepartmentId || targetDepartmentId === activeDepartmentId) return;

      const oldIndex = departments.findIndex(
        (department) => department.id === activeDepartmentId
      );
      const newIndex = departments.findIndex(
        (department) => department.id === targetDepartmentId
      );

      if (oldIndex === -1 || newIndex === -1) return;

      if (serverPlannerWriteEnabled) {
        if (
          !isSuperAdmin ||
          serverPlannerStatus !== 'ready' ||
          movingDepartmentId !== null
        ) {
          return;
        }

        const orderedDepartmentIds = arrayMove(
          departments.map((department) => department.id),
          oldIndex,
          newIndex
        );

        let reorderInput;
        try {
          reorderInput = buildDepartmentReorderInput(
            orderedDepartmentIds,
            serverDepartmentMetadata
          );
        } catch (error) {
          alert(
            error instanceof Error
              ? error.message
              : 'Не удалось подготовить новый порядок отделов.'
          );
          void refreshServerPlanner();
          return;
        }

        setMovingDepartmentId(activeDepartmentId);
        void reorderPlannerDepartments(reorderInput)
          .then(() => refreshServerPlanner())
          .catch((error) => {
            console.error('Server department reorder failed', error);
            alert(
              error instanceof Error
                ? 'Не удалось изменить порядок отделов: ' + error.message
                : 'Не удалось изменить порядок отделов на сервере.'
            );
            void refreshServerPlanner();
          })
          .finally(() => {
            setMovingDepartmentId(null);
          });
        return;
      }

      setDepartments((prev) => arrayMove(prev, oldIndex, newIndex));
      return;
    }

    if (!activeRaw.startsWith('emp:')) return;

    const activeEmployeeId = activeRaw.slice(4);
    const overEmployeeId = overRaw.startsWith('emp:') ? overRaw.slice(4) : null;
    const targetDepartmentId = overRaw.startsWith('dep:')
      ? overRaw.slice(4)
      : overRaw.startsWith('dept:')
        ? overRaw.slice(5)
        : overEmployeeId
          ? employees.find((employee) => employee.id === overEmployeeId)?.departmentId
          : undefined;

    if (!targetDepartmentId) return;

    const activeEmployee = employees.find(
      (employee) => employee.id === activeEmployeeId
    );
    if (!activeEmployee) return;

    if (serverPlannerWriteEnabled) {
      if (serverPlannerStatus !== 'ready' || movingEmployeeId !== null) {
        return;
      }

      setMovingEmployeeId(activeEmployeeId);

      if (activeEmployee.departmentId === targetDepartmentId) {
        if (!overEmployeeId || overEmployeeId === activeEmployeeId) {
          setMovingEmployeeId(null);
          return;
        }

        const departmentEmployeeIds = employees
          .filter(
            (employee) => employee.departmentId === targetDepartmentId
          )
          .map((employee) => employee.id);
        const oldIndex = departmentEmployeeIds.indexOf(activeEmployeeId);
        const newIndex = departmentEmployeeIds.indexOf(overEmployeeId);

        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
          setMovingEmployeeId(null);
          return;
        }

        const orderedEmployeeIds = arrayMove(
          departmentEmployeeIds,
          oldIndex,
          newIndex
        );

        let reorderInput;
        try {
          reorderInput = buildEmployeeReorderInput(
            targetDepartmentId,
            orderedEmployeeIds,
            serverEmployeeMetadata
          );
        } catch (error) {
          setMovingEmployeeId(null);
          alert(
            error instanceof Error
              ? error.message
              : 'Не удалось подготовить новый порядок сотрудников.'
          );
          void refreshServerPlanner();
          return;
        }

        void reorderPlannerEmployees(reorderInput)
          .then(() => refreshServerPlanner())
          .catch((error) => {
            console.error('Server employee reorder failed', error);
            alert(
              error instanceof Error
                ? 'Не удалось изменить порядок сотрудников: ' + error.message
                : 'Не удалось изменить порядок сотрудников на сервере.'
            );
            void refreshServerPlanner();
          })
          .finally(() => {
            setMovingEmployeeId(null);
          });
        return;
      }

      const metadata = serverEmployeeMetadata[activeEmployeeId];
      if (!metadata) {
        setMovingEmployeeId(null);
        alert('Не удалось определить версию сотрудника. Обновляю данные.');
        void refreshServerPlanner();
        return;
      }

      void updatePlannerEmployee(
        activeEmployeeId,
        buildEmployeeMoveInput(targetDepartmentId, metadata)
      )
        .then(() => refreshServerPlanner())
        .catch((error) => {
          console.error('Server employee move failed', error);
          alert(
            error instanceof Error
              ? 'Не удалось переместить сотрудника: ' + error.message
              : 'Не удалось переместить сотрудника на сервере.'
          );
          void refreshServerPlanner();
        })
        .finally(() => {
          setMovingEmployeeId(null);
        });
      return;
    }

    setEmployees((prev) => {
      const sourceIndex = prev.findIndex(
        (employee) => employee.id === activeEmployeeId
      );
      if (sourceIndex === -1) return prev;

      const moved: Employee = {
        ...prev[sourceIndex],
        departmentId: targetDepartmentId,
      };

      const next = prev.filter(
        (employee) => employee.id !== activeEmployeeId
      );

      if (overEmployeeId && overEmployeeId !== activeEmployeeId) {
        const overIndex = next.findIndex(
          (employee) => employee.id === overEmployeeId
        );
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
          departments
            .slice(departmentIndex + 1)
            .map((department) => department.id)
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

  const addWish = (employeeId: string, wish: Omit<EmployeeWish, 'id'>) => {
    if (!serverPlannerWriteEnabled) {
      setWishes((prev) => ({
        ...prev,
        [employeeId]: {
          ...(prev[employeeId] || {}),
          [periodKey]: [
            ...(prev[employeeId]?.[periodKey] || []),
            { ...wish, id: generateId() },
          ],
        },
      }));
      return;
    }

    if (serverPlannerStatus !== 'ready' || mutatingWishId !== null) {
      alert('График ещё не готов к изменению пожеланий.');
      return;
    }

    setMutatingWishId('create:' + employeeId);
    void createPlannerWish({
      employeeId,
      year,
      month: month + 1,
      day: wish.day,
      text: wish.text,
    })
      .then(() => refreshServerPlanner())
      .catch((error) => {
        console.error('Server wish create failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось добавить пожелание: ' + error.message
            : 'Не удалось добавить пожелание на сервере.'
        );
        void refreshServerPlanner();
      })
      .finally(() => {
        setMutatingWishId(null);
      });
  };

  const removeWish = (employeeId: string, wishId: string) => {
    if (!serverPlannerWriteEnabled) {
      setWishes((prev) => ({
        ...prev,
        [employeeId]: {
          ...(prev[employeeId] || {}),
          [periodKey]: (prev[employeeId]?.[periodKey] || []).filter(
            (wish) => wish.id !== wishId
          ),
        },
      }));
      return;
    }

    if (serverPlannerStatus !== 'ready' || mutatingWishId !== null) {
      alert('График ещё не готов к изменению пожеланий.');
      return;
    }

    setMutatingWishId(wishId);
    void deletePlannerWish(wishId)
      .then(() => refreshServerPlanner())
      .catch((error) => {
        console.error('Server wish delete failed', error);
        alert(
          error instanceof Error
            ? 'Не удалось удалить пожелание: ' + error.message
            : 'Не удалось удалить пожелание на сервере.'
        );
        void refreshServerPlanner();
      })
      .finally(() => {
        setMutatingWishId(null);
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

  const runServerBulkChanges = async (
    changes: ScheduleCellChange[],
    errorPrefix: string,
  ) => {
    if (changes.length === 0) {
      return;
    }

    try {
      setIsBulkWriting(true);
      await applyManageableScheduleChanges(year, month + 1, changes);
      await refreshServerPlanner();
    } catch (error) {
      console.error('Server bulk schedule write failed', error);
      alert(
        error instanceof Error
          ? errorPrefix + ': ' + error.message
          : errorPrefix + ' на сервере.'
      );
      await refreshServerPlanner();
      throw error;
    } finally {
      setIsBulkWriting(false);
    }
  };

  const fillOffAll = () => {
    if (!confirm('Заполнить все пустые ячейки текущего месяца как OFF?')) return;

    if (!serverPlannerWriteEnabled) {
      updateCurrentSchedule((current) => {
        const next = { ...current };

        employees.forEach((employee) => {
          let employeeSchedule = { ...(next[employee.id] || {}) };

          for (let day = 1; day <= daysInMonth; day++) {
            if (!employeeSchedule[day] || employeeSchedule[day].type === 'empty') {
              employeeSchedule = {
                ...employeeSchedule,
                [day]: { type: 'off' },
              };
            }
          }

          next[employee.id] = employeeSchedule;
        });

        return next;
      });
      return;
    }

    if (!canEditBulkSchedule) {
      alert('График ещё не готов к массовому изменению.');
      return;
    }

    const changes: ScheduleCellChange[] = [];
    employees.forEach((employee) => {
      for (let day = 1; day <= daysInMonth; day++) {
        const rawEntry = rawSchedule[employee.id]?.[day];
        if (!rawEntry || rawEntry.type === 'empty') {
          changes.push(
            buildScheduleCellChange(
              employee.id,
              day,
              { type: 'off' },
              serverCellMetadata[employee.id]?.[day],
            ),
          );
        }
      }
    });

    void runServerBulkChanges(
      changes,
      'Не удалось заполнить пустые ячейки как OFF',
    );
  };

  const clearAll = () => {
    if (!confirm('Очистить все смены за текущий месяц?')) return;

    if (!serverPlannerWriteEnabled) {
      setSchedules((prev) => ({ ...prev, [periodKey]: {} }));
      return;
    }

    if (!canEditBulkSchedule) {
      alert('График ещё не готов к массовому изменению.');
      return;
    }

    const changes: ScheduleCellChange[] = [];
    Object.entries(rawSchedule).forEach(([employeeId, employeeSchedule]) => {
      Object.entries(employeeSchedule).forEach(([dayValue, entry]) => {
        if (entry.type === 'empty') return;
        const day = Number(dayValue);
        changes.push(
          buildScheduleCellChange(
            employeeId,
            day,
            { type: 'empty' },
            serverCellMetadata[employeeId]?.[day],
          ),
        );
      });
    });

    void runServerBulkChanges(
      changes,
      'Не удалось очистить текущий месяц',
    );
  };

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

  const handlePrintSchedule = () => {
    printSchedule({
      departments,
      employees,
      schedule,
      schedules: effectiveSchedulePeriods,
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
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = '';
      }
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
    if (!excelImportPreview || isBulkWriting) return;

    const result = applyExcelImportEntries({
      currentSchedule: rawSchedule,
      protectedSchedule: schedule,
      entries: excelImportPreview.entries,
      daysInMonth,
      overwriteExisting: overwriteExcelCells,
    });

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

    if (!canEditBulkSchedule) {
      alert('График ещё не готов к импорту.');
      return;
    }

    const changesByCell = new Map<string, ScheduleCellChange>();

    excelImportPreview.entries.forEach((item) => {
      if (
        !item.employeeId ||
        item.day < 1 ||
        item.day > daysInMonth
      ) {
        return;
      }

      const before = rawSchedule[item.employeeId]?.[item.day];
      const after = result.schedule[item.employeeId]?.[item.day];

      if (
        !after ||
        after.type === 'error' ||
        JSON.stringify(before) === JSON.stringify(after)
      ) {
        return;
      }

      changesByCell.set(
        item.employeeId + ':' + item.day,
        buildScheduleCellChange(
          item.employeeId,
          item.day,
          after,
          serverCellMetadata[item.employeeId]?.[item.day],
        ),
      );
    });

    try {
      await runServerBulkChanges(
        Array.from(changesByCell.values()),
        'Не удалось применить Excel-импорт',
      );
      setExcelImportPreview(null);
      setOverwriteExcelCells(false);
      alert(details.join('\n'));
    } catch {
      // Ошибка уже показана в runServerBulkChanges; preview оставляем открытым.
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
          <HeaderCard>
            <HeaderRow>
              <HeaderLeft>
                <ThemeButton
                  type="button"
                  onClick={() =>
                    setThemeMode((value) =>
                      value === 'light' ? 'dark' : 'light'
                    )
                  }
                  title={
                    themeMode === 'light'
                      ? 'Включить тёмную тему'
                      : 'Включить светлую тему'
                  }
                >
                  {themeMode === 'light' ? <Moon size={19} /> : <Sun size={19} />}
                </ThemeButton>

                <BrandBlock>
                  <BrandTitle>🏨 Планировщик смен</BrandTitle>
                  <Muted>
                    Расписание сотрудников отеля • Отделы • Drag & Drop • Пожелания
                  </Muted>
                </BrandBlock>
              </HeaderLeft>

              <HeaderActions>
                <IconButton
                  type="button"
                  onClick={prevMonth}
                  title="Предыдущий месяц"
                >
                  <ChevronLeft size={19} />
                </IconButton>

                <MonthLabel>
                  {MONTH_NAMES[month]} {year}
                </MonthLabel>

                <IconButton
                  type="button"
                  onClick={nextMonth}
                  title="Следующий месяц"
                >
                  <ChevronRight size={19} />
                </IconButton>

                <MySchedulePanel year={year} monthIndex={month} />
                {canManagePlanner && <AdminOnboardingPanel />}

                {canManagePlanner && (
                  <IconButton
                    type="button"
                    onClick={() => setShowHelp((value) => !value)}
                    title="Справка"
                  >
                    <Info size={18} />
                  </IconButton>
                )}
              </HeaderActions>
            </HeaderRow>
          </HeaderCard>

          {serverPlannerReadEnabled && (
            <Card style={{ marginTop: 14, padding: 16 }}>
              <PanelTitle>Серверный режим графика</PanelTitle>
              <Muted style={{ marginTop: 4 }}>
                {serverPlannerStatus === 'loading'
                  ? 'Загружаю отделы, сотрудников и сохранённые смены с backend. Редактирование временно отключено.'
                  : serverPlannerStatus === 'error'
                    ? 'Не удалось обновить данные с backend. Показан локальный кэш, редактирование заблокировано: ' +
                      (serverPlannerError || 'неизвестная ошибка')
                    : serverPlannerWriteEnabled
                      ? 'Данные текущего месяца загружены с backend. Запись включена для смен и Employee; SUPER_ADMIN также может создавать, редактировать, деактивировать и менять порядок отделов.'
                      : 'Данные текущего месяца загружены с backend. Это контролируемый read-only этап миграции; локальные изменения отключены.'}
              </Muted>
            </Card>
          )}

          {canManagePlanner && showHelp && (
            <HelpCard>
              <PanelTitleRow>
                <div>
                  <PanelTitle>Как пользоваться</PanelTitle>
                  <Muted>
                    Смены сохраняются отдельно для каждого месяца. Пожелания тоже
                    привязаны к выбранному месяцу.
                  </Muted>
                </div>
                <IconButton type="button" onClick={() => setShowHelp(false)}>
                  ×
                </IconButton>
              </PanelTitleRow>

              <HelpGrid>
                <div>
                  <TinyText>Обычная смена: 08:00-17:00</TinyText>
                  <TinyText>С кодом: E 07:00-16:00</TinyText>
                  <TinyText>Ночная N: N 20:00-08:00</TinyText>
                  <TinyText>Выходной: OFF</TinyText>
                </div>
                <div>
                  <TinyText>⋮⋮ — перетащить сотрудника.</TinyText>
                  <TinyText>⋮⋮ в строке отдела — переместить весь отдел.</TinyText>
                  <TinyText>▾ / › — свернуть или развернуть отдел.</TinyText>
                  <TinyText>💬 — открыть пожелания сотрудника.</TinyText>
                  <TinyText>Можно переносить людей между отделами.</TinyText>
                </div>
              </HelpGrid>
            </HelpCard>
          )}

          {canManagePlanner && (
          <ControlsCard>
            <ControlsRow>
              <TextInput
                type="text"
                value={newEmployeeName}
                disabled={!canCreateEmployee || isCreatingEmployee}
                onChange={(event) => setNewEmployeeName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && addEmployee()}
                placeholder="ФИО нового сотрудника..."
              />

              <Select
                value={newEmployeeDepartmentId}
                disabled={!canCreateEmployee || isCreatingEmployee}
                onChange={(event) =>
                  setNewEmployeeDepartmentId(event.target.value)
                }
              >
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>

              <Select
                value={newEmployeeScheduleMode}
                disabled={!canCreateEmployee || isCreatingEmployee}
                onChange={(event) =>
                  setNewEmployeeScheduleMode(
                    event.target.value as EmployeeScheduleMode
                  )
                }
                title="Тип рабочего графика сотрудника"
              >
                <option value="flexible">Плавающий график</option>
                <option value="fixed-weekdays">5/2 · фиксированные часы</option>
              </Select>

              {newEmployeeScheduleMode === 'fixed-weekdays' && (
                <>
                  <TextInput
                    type="time"
                    value={newEmployeeFixedStartTime}
                    disabled={!canCreateEmployee || isCreatingEmployee}
                    onChange={(event) =>
                      setNewEmployeeFixedStartTime(event.target.value)
                    }
                    title="Начало рабочего дня"
                    aria-label="Начало рабочего дня"
                    style={{ width: 118 }}
                  />
                  <TextInput
                    type="time"
                    value={newEmployeeFixedEndTime}
                    disabled={!canCreateEmployee || isCreatingEmployee}
                    onChange={(event) =>
                      setNewEmployeeFixedEndTime(event.target.value)
                    }
                    title="Окончание рабочего дня"
                    aria-label="Окончание рабочего дня"
                    style={{ width: 118 }}
                  />
                </>
              )}

              <ActionButton
                type="button"
                $variant="primary"
                onClick={() => void addEmployee()}
                disabled={!canCreateEmployee || isCreatingEmployee}
              >
                <Plus size={16} />
                {isCreatingEmployee ? 'Добавляю…' : 'Сотрудник'}
              </ActionButton>

              <ActionButton
                type="button"
                $variant="accent"
                onClick={() => setShowDepartments((value) => !value)}
                disabled={!canManageDepartments}
              >
                <Layers3 size={16} />
                Отделы
              </ActionButton>

              <ActionButton
                type="button"
                $variant={scheduleView === 'schedule' ? 'primary' : 'secondary'}
                onClick={() => {
                  setEditingCell(null);
                  setScheduleView('schedule');
                }}
              >
                График
              </ActionButton>

              <ActionButton
                type="button"
                $variant={scheduleView === 'hours' ? 'primary' : 'secondary'}
                onClick={() => {
                  setEditingCell(null);
                  setScheduleView('hours');
                }}
              >
                День / ночь
              </ActionButton>

              <Divider />

              <input
                ref={excelFileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={(event) =>
                  handleExcelFile(event.target.files?.[0] || null)
                }
              />

              <ActionButton
                type="button"
                onClick={() => excelFileInputRef.current?.click()}
                disabled={!canEditBulkSchedule || isImportingExcel || isBulkWriting}
                title="Загрузить график из Excel с предпросмотром"
              >
                <FileUp size={16} />
                {isImportingExcel ? 'Читаю…' : 'Импорт Excel'}
              </ActionButton>

              <ActionButton
                type="button"
                $variant="accent"
                onClick={handleExportExcel}
                disabled={isExportingExcel}
                title="Сформировать Excel-файл текущего месяца"
              >
                <FileSpreadsheet size={16} />
                {isExportingExcel ? 'Excel…' : 'Экспорт Excel'}
              </ActionButton>

              <Select
                value={printRangeKey}
                onChange={(event) => setPrintRangeKey(event.target.value)}
                title="Что печатать"
                style={{ minWidth: 150 }}
              >
                <option value="month">Весь месяц</option>
                {printCalendarWeekRanges.map((range) => (
                  <option key={range.key} value={range.key}>
                    Неделя {range.label}
                  </option>
                ))}
              </Select>

              <ActionButton
                type="button"
                onClick={handlePrintSchedule}
                title="Открыть печатную версию A4"
              >
                <Printer size={16} />
                Печать
              </ActionButton>

              <ActionButton
                type="button"
                onClick={fillOffAll}
                disabled={!canEditBulkSchedule}
              >
                OFF все
              </ActionButton>

              <ActionButton
                type="button"
                $variant="danger"
                onClick={clearAll}
                disabled={!canEditBulkSchedule}
              >
                <Trash2 size={15} />
                Очистить месяц
              </ActionButton>
            </ControlsRow>
          </ControlsCard>
          )}

          {canManageDepartments && showDepartments && (
            <DepartmentPanel>
              <PanelTitleRow>
                <div>
                  <PanelTitle>Отделы сотрудников</PanelTitle>
                  <Muted>
                    Создавайте отделы и переносите сотрудников между ними прямо
                    в таблице.
                  </Muted>
                </div>

                <ControlsRow>
                  <TextInput
                    value={newDepartmentName}
                    onChange={(event) => setNewDepartmentName(event.target.value)}
                    onKeyDown={(event) =>
                      event.key === 'Enter' && void addDepartment()
                    }
                    placeholder="Название отдела"
                    style={{ flex: '0 1 220px' }}
                  />

                  <Select
                    value={newDepartmentKind}
                    onChange={(event) =>
                      setNewDepartmentKind(
                        event.target.value as DepartmentKind
                      )
                    }
                  >
                    <option value="general">Обычный</option>
                    <option value="fo">FO Agents</option>
                    <option value="night">Night Agents</option>
                  </Select>

                  <ActionButton
                    type="button"
                    $variant="accent"
                    onClick={() => void addDepartment()}
                    disabled={mutatingDepartmentId !== null}
                  >
                    <Plus size={15} />
                    {mutatingDepartmentId === 'create' ? 'Добавляю…' : 'Отдел'}
                  </ActionButton>
                </ControlsRow>
              </PanelTitleRow>

              <DepartmentGrid>
                {departments.map((department) => {
                  const employeeCount = employees.filter(
                    (employee) => employee.departmentId === department.id
                  ).length;

                  return (
                    <DepartmentCard key={department.id}>
                      <DepartmentMeta>
                        <DepartmentName>{department.name}</DepartmentName>
                        <TinyText>{employeeCount} сотрудников</TinyText>
                      </DepartmentMeta>

                      <Select
                        value={department.kind}
                        disabled={mutatingDepartmentId !== null}
                        onChange={(event) =>
                          changeDepartmentKind(
                            department.id,
                            event.target.value as DepartmentKind
                          )
                        }
                        style={{ minHeight: 32, padding: '0 8px' }}
                      >
                        <option value="general">Отдел</option>
                        <option value="fo">FO</option>
                        <option value="night">Night</option>
                      </Select>

                      <RowIconButton
                        type="button"
                        disabled={mutatingDepartmentId !== null}
                        onClick={() => renameDepartment(department)}
                        title="Переименовать"
                      >
                        <Pencil size={14} />
                      </RowIconButton>

                      <RowIconButton
                        type="button"
                        disabled={mutatingDepartmentId !== null}
                        onClick={() => removeDepartment(department.id)}
                        title="Деактивировать пустой отдел"
                      >
                        <Trash2 size={14} />
                      </RowIconButton>
                    </DepartmentCard>
                  );
                })}
              </DepartmentGrid>
            </DepartmentPanel>
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
                        (employee) =>
                          employee.departmentId === department.id
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
                          setEditingCell={setEditingCell}
                          getEntry={getEntry}
                          getEmployeeTotals={getEmployeeTotals}
                          removeEmployee={removeEmployee}
                          onEditEmployee={setEditingEmployeeId}
                          getWishCount={(employeeId) =>
                            wishes[employeeId]?.[periodKey]?.length || 0
                          }
                          getWishSummary={(employeeId) =>
                            (wishes[employeeId]?.[periodKey] || [])
                              .slice(0, 3)
                              .map((wish) =>
                                (wish.day === null
                                  ? 'Общее'
                                  : String(wish.day)) +
                                ': ' +
                                wish.text
                              )
                              .join('\n')
                          }
                          onOpenWishes={setWishEmployeeId}
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
                            toggleDepartmentCollapsed(department.id)
                          }
                        />
                      );
                    })}
                    </SortableContext>


                  </tbody>
                  {canManagePlanner && employees.length > 0 && (
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
          </DndContext>
          )}

          {canManagePlanner &&
            scheduleView === 'hours' &&
            employees.length > 0 && (
            <WeeklyHoursPanel
              employees={employees}
              schedule={schedule}
              year={year}
              month={month}
              weeks={printWeekRanges}
              onRateChange={changeEmployeeRate}
              readOnly={
                !canEditEmployeeRate || updatingEmployeeRateId !== null
              }
            />
          )}

          {canManagePlanner && (
            <ErrorPanel
              schedule={schedule}
              employees={employees}
              daysInMonth={daysInMonth}
            />
          )}

          {canManagePlanner && <Legend>
            <span>⋮⋮ Перетащить сотрудника или отдел</span>
            <span>▾ / › Свернуть отдел</span>
            <span>💬 Пожелания</span>
            <span>График / День-ночь — два режима таблицы</span>
            <span>☀️ Дневная смена</span>
            <span>🌙 Ночная смена</span>
            <span>OFF Выходной</span>
          </Legend>}

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

      {canEditBulkSchedule && excelImportPreview && (
        <ExcelImportDrawer
          preview={excelImportPreview}
          conflictCount={excelImportConflictCount}
          overwriteExisting={overwriteExcelCells}
          busy={isBulkWriting}
          onOverwriteChange={setOverwriteExcelCells}
          onApply={() => void applyExcelImport()}
          onClose={() => {
            setExcelImportPreview(null);
            setOverwriteExcelCells(false);
          }}
        />
      )}

      {canEditScheduleCells && selectedShiftEmployee && editingCell && (
        <ShiftEditor
          key={selectedShiftEmployee.id + '-' + editingCell.day + '-' + periodKey}
          employee={selectedShiftEmployee}
          day={editingCell.day}
          year={year}
          month={month}
          entry={getEntry(selectedShiftEmployee.id, editingCell.day)}
          onSave={(value) => {
            updateCell(selectedShiftEmployee.id, editingCell.day, value);
            setEditingCell(null);
          }}
          onClose={() => setEditingCell(null)}
        />
      )}

      {selectedEditEmployee && canManageEmployeeProfiles && (
        <EmployeeEditDrawer
          key={selectedEditEmployee.id}
          employee={selectedEditEmployee}
          departments={departments}
          busy={mutatingEmployeeId === selectedEditEmployee.id}
          onSave={saveEmployeeEdit}
          onDeactivate={() => removeEmployee(selectedEditEmployee.id)}
          onClose={() => setEditingEmployeeId(null)}
        />
      )}

      {canEditWishes && selectedWishEmployee && (
        <EmployeeWishDrawer
          key={selectedWishEmployee.id + periodKey}
          employee={selectedWishEmployee}
          year={year}
          month={month}
          daysInMonth={daysInMonth}
          wishes={wishes[selectedWishEmployee.id]?.[periodKey] || []}
          busy={mutatingWishId !== null}
          onAdd={(wish) => addWish(selectedWishEmployee.id, wish)}
          onRemove={(wishId) =>
            removeWish(selectedWishEmployee.id, wishId)
          }
          onClose={() => setWishEmployeeId(null)}
        />
      )}
    </ThemeProvider>
  );
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

function DepartmentSection({
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

export default App;
