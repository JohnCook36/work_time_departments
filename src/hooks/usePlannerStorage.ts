import { useCallback } from 'react';

import {
  Department,
  Employee,
  EmployeeWishesData,
  ScheduleData,
  SchedulePeriodsData,
} from '../types';

const STORAGE_KEY = 'hotel-shift-planner';

interface StoredData {
  employees?: Array<Employee | Omit<Employee, 'departmentId'>>;
  departments?: Department[];
  schedule?: ScheduleData;
  schedules?: SchedulePeriodsData;
  wishes?: EmployeeWishesData;
  collapsedDepartments?: string[];
}

export interface LoadedPlannerStorage {
  employees: Employee[];
  departments: Department[];
  schedules: SchedulePeriodsData;
  wishes: EmployeeWishesData;
  collapsedDepartments: string[];
}

export interface PlannerStorageDefaults {
  departments: Department[];
  employees: Employee[];
}

export interface PlannerStorageState {
  employees: Employee[];
  departments: Department[];
  schedules: SchedulePeriodsData;
  wishes: EmployeeWishesData;
  collapsedDepartments: string[];
}

function loadPlannerStorage(
  initialPeriodKey: string,
  defaults: PlannerStorageDefaults
): LoadedPlannerStorage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as StoredData;
    const departments =
      Array.isArray(data.departments) && data.departments.length > 0
        ? data.departments
        : defaults.departments;

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
      : defaults.employees.map((employee) => ({
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

function savePlannerStorage(state: PlannerStorageState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Browser storage may be unavailable.
  }
}

export function usePlannerStorage(enabled: boolean) {
  const load = useCallback(
    (
      initialPeriodKey: string,
      defaults: PlannerStorageDefaults
    ): LoadedPlannerStorage | null => {
      if (!enabled) return null;
      return loadPlannerStorage(initialPeriodKey, defaults);
    },
    [enabled]
  );

  const persist = useCallback(
    (state: PlannerStorageState): void => {
      if (!enabled) return;
      savePlannerStorage(state);
    },
    [enabled]
  );

  return {
    load,
    persist,
  };
}
