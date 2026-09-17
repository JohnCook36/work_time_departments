export type DepartmentKind = 'generic' | 'fo' | 'night';

export interface Department {
  id: string;
  name: string;
  kind: DepartmentKind;
}

export interface Shift {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  code?: string;
}

export interface ShiftEntry {
  type: 'shift' | 'off' | 'vac' | 'sick' | 'empty' | 'error';
  shift?: Shift;
  error?: string;
}

export interface Employee {
  id: string;
  name: string;
  departmentId: string;
  targetHours?: number;
  breakMinutes?: number;
  nightOnly?: boolean;
}

export interface ScheduleData {
  [employeeId: string]: {
    [dateKey: string]: ShiftEntry;
  };
}

export interface PlannerState {
  version: number;
  departments: Department[];
  employees: Employee[];
  schedule: ScheduleData;
}
