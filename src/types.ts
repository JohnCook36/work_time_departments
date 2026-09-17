export interface Shift {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface ShiftEntry {
  type: 'shift' | 'off' | 'empty' | 'error';
  shift?: Shift;
  error?: string;
}

export type DepartmentKind = 'general' | 'fo' | 'night';

export interface Department {
  id: string;
  name: string;
  kind: DepartmentKind;
}

export interface Employee {
  id: string;
  name: string;
  departmentId: string;
}

export interface ScheduleData {
  [employeeId: string]: {
    [day: number]: ShiftEntry;
  };
}
