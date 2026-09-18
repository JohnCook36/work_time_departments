import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ExcelImportDrawer } from './ExcelImportDrawer';
import {
  ExcelImportPreview,
  parseScheduleExcel,
} from './importExcel';
import { exportScheduleToExcel } from './exportExcel';
import { getMonthWeekRanges, printSchedule } from './printSchedule';
import { ShiftEditor } from './ShiftEditor';
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
        }))
      : DEFAULT_EMPLOYEES;

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
  const [scheduleView, setScheduleView] = useState<ScheduleView>('schedule');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [excelImportPreview, setExcelImportPreview] =
    useState<ExcelImportPreview | null>(null);
  const [overwriteExcelCells, setOverwriteExcelCells] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [printRangeKey, setPrintRangeKey] = useState('month');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragTargetDepartmentId, setDragTargetDepartmentId] = useState<string | null>(null);

  const theme = useMemo(() => getTheme(themeMode), [themeMode]);
  const periodKey = getPeriodKey(year, month);
  const schedule = schedules[periodKey] || {};
  const daysInMonth = getDaysInMonth(year, month);
  const printWeekRanges = useMemo(
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

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, themeMode);
    } catch {
      // ignore
    }
  }, [themeMode]);

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
      updateCurrentSchedule((current) => ({
        ...current,
        [empId]: {
          ...(current[empId] || {}),
          [day]: entry,
        },
      }));
    },
    [updateCurrentSchedule]
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
    if (!confirm('Удалить сотрудника, его смены и пожелания?')) return;

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
    setCollapsedDepartments((prev) =>
      prev.filter((id) => id !== departmentId)
    );
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

      setDepartments((prev) => {
        const oldIndex = prev.findIndex(
          (department) => department.id === activeDepartmentId
        );
        const newIndex = prev.findIndex(
          (department) => department.id === targetDepartmentId
        );

        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
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
  };

  const removeWish = (employeeId: string, wishId: string) => {
    setWishes((prev) => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] || {}),
        [periodKey]: (prev[employeeId]?.[periodKey] || []).filter(
          (wish) => wish.id !== wishId
        ),
      },
    }));
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

  const fillOffAll = () => {
    if (!confirm('Заполнить все пустые ячейки текущего месяца как OFF?')) return;

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
  };

  const clearAll = () => {
    if (!confirm('Очистить все смены за текущий месяц?')) return;
    setSchedules((prev) => ({ ...prev, [periodKey]: {} }));
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

  const applyExcelImport = () => {
    if (!excelImportPreview) return;

    let applied = 0;
    let skippedProtected = 0;
    let skippedOutsideMonth = 0;

    updateCurrentSchedule((current) => {
      const next: ScheduleData = { ...current };

      excelImportPreview.entries.forEach((item) => {
        if (!item.employeeId) return;

        if (item.day < 1 || item.day > daysInMonth) {
          skippedOutsideMonth++;
          return;
        }

        const employeeSchedule = { ...(next[item.employeeId] || {}) };
        const existing = employeeSchedule[item.day];

        if (
          !overwriteExcelCells &&
          existing &&
          existing.type !== 'empty'
        ) {
          skippedProtected++;
          return;
        }

        employeeSchedule[item.day] = validateShiftInput(item.value);
        next[item.employeeId] = employeeSchedule;
        applied++;
      });

      return next;
    });

    setExcelImportPreview(null);
    setOverwriteExcelCells(false);

    const details = [
      'Импортировано смен: ' + applied,
      skippedProtected > 0
        ? 'Защищено заполненных ячеек: ' + skippedProtected
        : null,
      skippedOutsideMonth > 0
        ? 'Пропущено дней вне текущего месяца: ' + skippedOutsideMonth
        : null,
    ].filter(Boolean);

    alert(details.join('\n'));
  };

  const selectedWishEmployee =
    wishEmployeeId === null
      ? null
      : employees.find((employee) => employee.id === wishEmployeeId) || null;

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

                <IconButton
                  type="button"
                  onClick={() => setShowHelp((value) => !value)}
                  title="Справка"
                >
                  <Info size={18} />
                </IconButton>
              </HeaderActions>
            </HeaderRow>
          </HeaderCard>

          {showHelp && (
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

          <ControlsCard>
            <ControlsRow>
              <TextInput
                type="text"
                value={newEmployeeName}
                onChange={(event) => setNewEmployeeName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && addEmployee()}
                placeholder="ФИО нового сотрудника..."
              />

              <Select
                value={newEmployeeDepartmentId}
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

              <ActionButton type="button" $variant="primary" onClick={addEmployee}>
                <Plus size={16} />
                Сотрудник
              </ActionButton>

              <ActionButton
                type="button"
                $variant="accent"
                onClick={() => setShowDepartments((value) => !value)}
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
                disabled={isImportingExcel}
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
                {printWeekRanges.map((range) => (
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

              <ActionButton type="button" onClick={fillOffAll}>
                OFF все
              </ActionButton>

              <ActionButton type="button" $variant="danger" onClick={clearAll}>
                <Trash2 size={15} />
                Очистить месяц
              </ActionButton>
            </ControlsRow>
          </ControlsCard>

          {showDepartments && (
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
                      event.key === 'Enter' && addDepartment()
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
                    onClick={addDepartment}
                  >
                    <Plus size={15} />
                    Отдел
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
                        onClick={() => renameDepartment(department)}
                        title="Переименовать"
                      >
                        <Pencil size={14} />
                      </RowIconButton>

                      <RowIconButton
                        type="button"
                        onClick={() => removeDepartment(department.id)}
                        title="Удалить пустой отдел"
                      >
                        <Trash2 size={14} />
                      </RowIconButton>
                    </DepartmentCard>
                  );
                })}
              </DepartmentGrid>
            </DepartmentPanel>
          )}

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

                    {employees.length > 0 && (
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
                    )}
                  </tbody>
                </ScheduleTable>
              </TableScroll>

              {employees.length === 0 && (
                <div style={{ padding: 28, textAlign: 'center' }}>
                  Сотрудников пока нет.
                </div>
              )}
            </TableShell>

            <DragOverlay dropAnimation={{ duration: 140, easing: 'ease-out' }}>
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
            </DragOverlay>
          </DndContext>

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

          <Footer>
            <div>
              Данные сохраняются локально в браузере • Смены и пожелания раздельно
              по месяцам
            </div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>
              Powered by Anastasiya P.
            </div>
          </Footer>
        </Container>
      </Page>

      {excelImportPreview && (
        <ExcelImportDrawer
          preview={excelImportPreview}
          conflictCount={excelImportConflictCount}
          overwriteExisting={overwriteExcelCells}
          onOverwriteChange={setOverwriteExcelCells}
          onApply={applyExcelImport}
          onClose={() => {
            setExcelImportPreview(null);
            setOverwriteExcelCells(false);
          }}
        />
      )}

      {selectedShiftEmployee && editingCell && (
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

      {selectedWishEmployee && (
        <EmployeeWishDrawer
          key={selectedWishEmployee.id + periodKey}
          employee={selectedWishEmployee}
          year={year}
          month={month}
          daysInMonth={daysInMonth}
          wishes={wishes[selectedWishEmployee.id]?.[periodKey] || []}
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
  getWishCount: (employeeId: string) => number;
  getWishSummary: (employeeId: string) => string;
  onOpenWishes: (employeeId: string) => void;
  scheduleView: ScheduleView;
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
  getWishCount,
  getWishSummary,
  onOpenWishes,
  scheduleView,
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
              title="Перетащить весь отдел"
              {...attributes}
              {...listeners}
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
            {employees.length === 0 && (
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
              wishCount={getWishCount(employee.id)}
              wishSummary={getWishSummary(employee.id)}
              onOpenWishes={onOpenWishes}
              scheduleView={scheduleView}
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
  wishCount: number;
  wishSummary: string;
  onOpenWishes: (employeeId: string) => void;
  scheduleView: ScheduleView;
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
  wishCount,
  wishSummary,
  onOpenWishes,
  scheduleView,
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
            title="Перетащить сотрудника"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </DragHandle>

          <EmployeeNameText>{employee.name}</EmployeeNameText>

          <RowIconButton
            type="button"
            $active={wishCount > 0}
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
            onClick={() => removeEmployee(employee.id)}
            title="Удалить сотрудника"
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
              onClick={
                scheduleView === 'schedule'
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
