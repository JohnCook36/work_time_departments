import { apiRequest } from './auth';

export interface ManagementPlanActualResponse {
  period: { year: number; month: number };
  businessTimeZone: string;
  payableAvailable: false;
  rows: Array<{
    departmentId: string;
    departmentName: string;
    publicationId: string;
    publicationVersion: number;
    shiftId: string;
    employeeId: string;
    displayName: string;
    date: string;
    code: string | null;
    startTime: string;
    endTime: string;
    workSessionId: string | null;
    workSessionIds: string[];
    workSessionCount: number;
    status: 'NO_MARK' | 'IN_PROGRESS' | 'COMPLETED';
    plannedStartAt: string;
    plannedEndAt: string;
    actualCheckInAt: string | null;
    actualCheckOutAt: string | null;
    plannedMinutes: number;
    plannedDayMinutes: number;
    plannedNightMinutes: number;
    actualMinutes: number | null;
    actualDayMinutes: number | null;
    actualNightMinutes: number | null;
    deltaMinutes: number | null;
    latenessMinutes: number;
    earlyLeaveMinutes: number | null;
    overtimeMinutes: number | null;
    undertimeMinutes: number | null;
    payableAvailable: false;
  }>;
  unplannedSessions: Array<{
    id: string;
    employeeId: string;
    displayName: string;
    departmentId: string;
    checkInAt: string;
    checkOutAt: string | null;
  }>;
}

export function getManagementPlanActual(
  year: number,
  month: number,
  departmentId?: string,
) {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (departmentId) params.set('departmentId', departmentId);
  return apiRequest<ManagementPlanActualResponse>(
    '/management/plan-actual?' + params.toString(),
  );
}
