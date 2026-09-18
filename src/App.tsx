import { useCallback, useEffect, useMemo, useState } from 'react';
import { Global, ThemeProvider } from '@emotion/react';
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
  GripVertical,
  Info,
  Layers3,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
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
  ShiftInput,
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

  const theme = useMemo(() => getTheme(themeMode), [themeMode]);
  const periodKey = getPeriodKey(year, month);
  const schedule = schedules[periodKey] || {};
  const daysInMonth = getDaysInMonth(year, month);

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

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
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

  const selectedWishEmployee =
    wishEmployeeId === null
      ? null
      : employees.find((employee) => employee.id === wishEmployeeId) || null;

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

              <Divider />

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
                          editingCell={editingCell}
                          setEditingCell={setEditingCell}
                          getEntry={getEntry}
                          updateCell={updateCell}
                          getDisplayValue={getDisplayValue}
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

                          employees.forEach((employee) => {
                            if (getEntry(employee.id, day).type === 'shift') {
                              dayCount++;
                            }
                          });

                          return (
                            <TotalCell key={day}>
                              {dayCount > 0 ? dayCount : ''}
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
            <span>☀️ Дневная смена</span>
            <span>🌙 Ночная смена</span>
            <span>OFF Выходной</span>
          </Legend>

          <Footer>
            Данные сохраняются локально в браузере • Смены и пожелания раздельно
            по месяцам
          </Footer>
        </Container>
      </Page>

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
  getWishCount: (employeeId: string) => number;
  getWishSummary: (employeeId: string) => string;
  onOpenWishes: (employeeId: string) => void;
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
  editingCell,
  setEditingCell,
  getEntry,
  updateCell,
  getDisplayValue,
  getEmployeeTotals,
  removeEmployee,
  getWishCount,
  getWishSummary,
  onOpenWishes,
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
          $over={isOver}
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
              editingCell={editingCell}
              setEditingCell={setEditingCell}
              getEntry={getEntry}
              updateCell={updateCell}
              getDisplayValue={getDisplayValue}
              totals={getEmployeeTotals(employee.id)}
              removeEmployee={removeEmployee}
              wishCount={getWishCount(employee.id)}
              wishSummary={getWishSummary(employee.id)}
              onOpenWishes={onOpenWishes}
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
  editingCell: { empId: string; day: number } | null;
  setEditingCell: (value: { empId: string; day: number } | null) => void;
  getEntry: (empId: string, day: number) => ShiftEntry;
  updateCell: (empId: string, day: number, value: string) => void;
  getDisplayValue: (entry: ShiftEntry) => string;
  totals: { day: number; night: number; total: number; workDays: number };
  removeEmployee: (id: string) => void;
  wishCount: number;
  wishSummary: string;
  onOpenWishes: (employeeId: string) => void;
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
  wishCount,
  wishSummary,
  onOpenWishes,
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

      {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
        (day) => {
          const entry = getEntry(employee.id, day);
          const dayOfWeek = getDayOfWeek(year, month, day);
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const isEditing =
            editingCell?.empId === employee.id &&
            editingCell?.day === day;

          let kind: 'empty' | 'error' | 'off' | 'day' | 'night' | 'mixed' =
            'empty';

          if (entry.type === 'error') {
            kind = 'error';
          } else if (entry.type === 'off') {
            kind = 'off';
          } else if (entry.type === 'shift') {
            const hours = calculateShiftHours(entry);
            kind =
              hours.night > 0 && hours.day === 0
                ? 'night'
                : hours.night > 0
                  ? 'mixed'
                  : 'day';
          }

          return (
            <ShiftCell
              key={day}
              $kind={kind}
              $weekend={isWeekend}
              onClick={() =>
                setEditingCell({ empId: employee.id, day })
              }
            >
              {isEditing ? (
                <ShiftInput
                  type="text"
                  defaultValue={getDisplayValue(entry)}
                  autoFocus
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
                        setEditingCell({
                          empId: employee.id,
                          day: day + 1,
                        });
                      }
                    }
                  }}
                />
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
