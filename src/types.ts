export type ShiftCode = 'E' | 'IN' | 'INN' | 'L' | 'N';

export interface Shift {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  code?: ShiftCode;
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

export type EmploymentRate = 1 | 0.75 | 0.5;
export type EmployeeScheduleMode = 'flexible' | 'fixed-weekdays';

export interface Employee {
  id: string;
  name: string;
  departmentId: string;
  employmentRate?: EmploymentRate;
  scheduleMode?: EmployeeScheduleMode;
  fixedStartTime?: string;
  fixedEndTime?: string;
}

export interface EmployeeWish {
  id: string;
  day: number | null;
  text: string;
}

export interface EmployeeWishesData {
  [employeeId: string]: {
    [periodKey: string]: EmployeeWish[];
  };
}

export interface ScheduleData {
  [employeeId: string]: {
    [day: number]: ShiftEntry;
  };
}

export interface SchedulePeriodsData {
  [periodKey: string]: ScheduleData;
}
