export interface Shift {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface ShiftEntry {
  type: 'shift' | 'off' | 'empty' | 'error';
  shift?: Shift;
  error?: string;
}

export interface Employee {
  id: string;
  name: string;
}

export interface ScheduleData {
  [employeeId: string]: {
    [day: number]: ShiftEntry;
  };
}
