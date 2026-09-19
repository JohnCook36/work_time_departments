import type {
  Department,
  DepartmentKind,
  Employee,
  EmploymentRate,
  ScheduleData,
  ShiftCode,
} from './types';
import { apiRequest } from './auth/api';

export interface ManageableDepartmentResponse {
  id: string;
  name: string;
  kind: 'GENERAL' | 'FO' | 'NIGHT';
  position: number;
  updatedAt: string;
}

export interface DepartmentScheduleResponse {
  period: {
    year: number;
    month: number;
  };
  schedule: {
    id: string;
    updatedAt: string;
  } | null;
  department: {
    id: string;
    name: string;
    kind: 'GENERAL' | 'FO' | 'NIGHT';
  };
  employees: Array<{
    id: string;
    displayName: string;
    employmentRate: number;
    scheduleMode: 'FLEXIBLE' | 'FIXED_WEEKDAYS';
    fixedStartTime: string | null;
    fixedEndTime: string | null;
    position: number;
  }>;
  shifts: Array<{
    id: string;
    employeeId: string;
    date: string;
    code: string | null;
    startTime: string | null;
    endTime: string | null;
    isOff: boolean;
    updatedAt: string;
  }>;
}

export interface PlannerServerSnapshot {
  departments: Department[];
  employees: Employee[];
  schedule: ScheduleData;
}

const SHIFT_CODES = new Set<ShiftCode>(['E', 'IN', 'INN', 'L', 'N']);

function mapDepartmentKind(
  kind: ManageableDepartmentResponse['kind'],
): DepartmentKind {
  if (kind === 'FO') return 'fo';
  if (kind === 'NIGHT') return 'night';
  return 'general';
}

function mapEmploymentRate(value: number): EmploymentRate {
  if (value === 0.75 || value === 0.5) return value;
  return 1;
}

function mapEmployee(
  departmentId: string,
  employee: DepartmentScheduleResponse['employees'][number],
): Employee {
  return {
    id: employee.id,
    name: employee.displayName,
    departmentId,
    employmentRate: mapEmploymentRate(employee.employmentRate),
    scheduleMode:
      employee.scheduleMode === 'FIXED_WEEKDAYS'
        ? 'fixed-weekdays'
        : 'flexible',
    ...(employee.fixedStartTime
      ? { fixedStartTime: employee.fixedStartTime }
      : {}),
    ...(employee.fixedEndTime
      ? { fixedEndTime: employee.fixedEndTime }
      : {}),
  };
}

export function mapDepartmentScheduleResponses(
  responses: DepartmentScheduleResponse[],
): PlannerServerSnapshot {
  const departments: Department[] = [];
  const employees: Employee[] = [];
  const schedule: ScheduleData = {};

  responses.forEach((response) => {
    departments.push({
      id: response.department.id,
      name: response.department.name,
      kind: mapDepartmentKind(response.department.kind),
    });

    response.employees.forEach((employee) => {
      employees.push(mapEmployee(response.department.id, employee));
    });

    response.shifts.forEach((shift) => {
      const day = Number(shift.date.slice(8, 10));
      if (!Number.isInteger(day) || day < 1 || day > 31) return;

      const employeeSchedule = schedule[shift.employeeId] || {};

      if (shift.isOff) {
        employeeSchedule[day] = { type: 'off' };
      } else if (shift.startTime && shift.endTime) {
        const normalizedCode = shift.code?.toUpperCase() as ShiftCode | undefined;
        employeeSchedule[day] = {
          type: 'shift',
          shift: {
            start: shift.startTime,
            end: shift.endTime,
            ...(normalizedCode && SHIFT_CODES.has(normalizedCode)
              ? { code: normalizedCode }
              : {}),
          },
        };
      } else {
        employeeSchedule[day] = {
          type: 'error',
          error: 'Серверная смена содержит неполные данные',
        };
      }

      schedule[shift.employeeId] = employeeSchedule;
    });
  });

  return { departments, employees, schedule };
}

export function getManageableDepartments() {
  return apiRequest<ManageableDepartmentResponse[]>('/departments/manageable');
}

export function getDepartmentPlannerSchedule(
  departmentId: string,
  year: number,
  month: number,
) {
  const params = new URLSearchParams({
    departmentId,
    year: String(year),
    month: String(month),
  });

  return apiRequest<DepartmentScheduleResponse>(
    '/schedule-data/department?' + params.toString(),
  );
}
