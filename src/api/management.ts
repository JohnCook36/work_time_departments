import { apiRequest } from './auth';

export interface ManagementTodayResponse {
  date: string;
  attendanceAvailable: boolean;
  totals: {
    plannedShifts: number;
    activeAbsences: number;
    pendingRequests: number;
    unpublishedDepartments: number;
  };
  departments: Array<{
    id: string;
    name: string;
    kind: string;
    publication: {
      id: string;
      version: number;
      publishedAt: string;
    } | null;
    plannedShifts: Array<{
      id: string;
      employeeId: string;
      displayName: string;
      date: string;
      code: string | null;
      startTime: string | null;
      endTime: string | null;
    }>;
    absences: Array<{
      id: string;
      employeeId: string;
      displayName: string;
      type: string;
      startDate: string;
      endDate: string;
      comment: string | null;
    }>;
    riskCount: number;
  }>;
  pendingRequests: Array<{
    id: string;
    kind: 'SWAP' | 'COVER';
    status: string;
    requesterDepartmentId: string;
    targetDepartmentId: string;
    requesterDisplayName: string;
    targetDisplayName: string;
    requesterShift: {
      date: string;
      startTime: string | null;
      endTime: string | null;
      code: string | null;
    };
    targetShift: {
      date: string;
      startTime: string | null;
      endTime: string | null;
      code: string | null;
    } | null;
    createdAt: string;
  }>;
}

export interface ManagementHoursResponse {
  period: { year: number; month: number };
  schedule: { id: string; updatedAt: string } | null;
  departmentNormConfigured: boolean;
  departments: Array<{
    id: string;
    name: string;
    kind: string;
    employeeCount: number;
    plannedHours: number;
    normHours: number;
    deltaHours: number;
    outsideNormCount: number;
  }>;
  employees: Array<{
    id: string;
    displayName: string;
    departmentId: string;
    employmentRate: number;
    shiftCount: number;
    dayHours: number;
    nightHours: number;
    plannedHours: number;
    productionNormHours: number;
    departmentNormHours: number | null;
    comparisonNormHours: number;
    deltaHours: number;
    status: 'balanced' | 'over' | 'under';
  }>;
}

export function getManagementToday(date: string) {
  const params = new URLSearchParams({ date });
  return apiRequest<ManagementTodayResponse>(
    '/management/today?' + params.toString(),
  );
}

export function getManagementHours(
  year: number,
  month: number,
  departmentId?: string,
) {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (departmentId) params.set('departmentId', departmentId);
  return apiRequest<ManagementHoursResponse>(
    '/management/hours?' + params.toString(),
  );
}
