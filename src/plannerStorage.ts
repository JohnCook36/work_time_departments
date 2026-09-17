import { Department, Employee, PlannerState, ScheduleData, ShiftEntry } from './types';
import { makeDateKey } from './utils';

export const STORAGE_KEY = 'hotel-shift-planner';
export const STORAGE_VERSION = 4;
export const UNGROUPED_ID = 'ungrouped';

export const DEFAULT_DEPARTMENTS: Department[] = [
  { id: UNGROUPED_ID, name: 'Без отдела', kind: 'generic' },
  { id: 'management', name: 'Management', kind: 'generic' },
  { id: 'passport', name: 'Passport', kind: 'generic' },
  { id: 'guest-relations', name: 'Guest Relations', kind: 'generic' },
  { id: 'fd-supervisors', name: 'FD Supervisors', kind: 'generic' },
  { id: 'fo-agents', name: 'FO Agents', kind: 'fo' },
  { id: 'night-team', name: 'Night Team', kind: 'night' },
  { id: 'ays-agents', name: 'AYS Agents', kind: 'generic' },
  { id: 'bellmen', name: 'Bellmen', kind: 'generic' },
];

// Demo names only. Real employee data stays in the user's browser localStorage.
export const DEFAULT_EMPLOYEES: Employee[] = [
  { id: '1', name: 'Иванова А.М.', departmentId: 'fo-agents', targetHours: 40, breakMinutes: 60 },
  { id: '2', name: 'Петров С.В.', departmentId: 'fo-agents', targetHours: 40, breakMinutes: 60 },
  { id: '3', name: 'Сидорова Е.К.', departmentId: 'fo-agents', targetHours: 40, breakMinutes: 60 },
  { id: '4', name: 'Козлов Д.И.', departmentId: 'night-team', targetHours: 40, breakMinutes: 0, nightOnly: true },
];

export function generateId(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function migrateSchedule(raw: unknown, year: number, month: number): ScheduleData {
  if (!raw || typeof raw !== 'object') return {};
  const result: ScheduleData = {};
  Object.entries(raw as Record<string, unknown>).forEach(([employeeId, employeeSchedule]) => {
    if (!employeeSchedule || typeof employeeSchedule !== 'object') return;
    result[employeeId] = {};
    Object.entries(employeeSchedule as Record<string, ShiftEntry>).forEach(([key, entry]) => {
      const migratedKey = /^\d{1,2}$/.test(key) ? makeDateKey(year, month, Number(key)) : key;
      result[employeeId][migratedKey] = entry;
    });
  });
  return result;
}

export function loadState(): PlannerState {
  const now = new Date();
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data) as Partial<PlannerState> & {
        employees?: Array<Partial<Employee> & { id: string; name: string }>;
        schedule?: unknown;
      };
      const departments = Array.isArray(parsed.departments) && parsed.departments.length
        ? parsed.departments
        : DEFAULT_DEPARTMENTS;
      const known = new Set(departments.map(item => item.id));
      const employees = Array.isArray(parsed.employees)
        ? parsed.employees.map(employee => ({
            id: employee.id,
            name: employee.name,
            departmentId: employee.departmentId && known.has(employee.departmentId)
              ? employee.departmentId
              : UNGROUPED_ID,
            targetHours: employee.targetHours ?? 40,
            breakMinutes: employee.breakMinutes ?? 60,
            nightOnly: employee.nightOnly ?? false,
          }))
        : DEFAULT_EMPLOYEES;
      return {
        version: STORAGE_VERSION,
        departments,
        employees,
        schedule: migrateSchedule(parsed.schedule, now.getFullYear(), now.getMonth()),
      };
    }
  } catch {
    // Broken localStorage should not prevent the application from opening.
  }
  return {
    version: STORAGE_VERSION,
    departments: DEFAULT_DEPARTMENTS,
    employees: DEFAULT_EMPLOYEES,
    schedule: {},
  };
}

export function saveState(state: PlannerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private/restricted browser modes.
  }
}
