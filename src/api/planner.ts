import type {
  Department,
  DepartmentKind,
  Employee,
  EmploymentRate,
  EmployeeWishesData,
  ScheduleData,
  ShiftCode,
  ShiftEntry,
} from '../domain/models';
import { apiRequest } from './auth';

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
  employees: EmployeeResponse[];
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

export interface EmployeeResponse {
  id: string;
  displayName: string;
  employmentRate: number;
  scheduleMode: 'FLEXIBLE' | 'FIXED_WEEKDAYS';
  fixedStartTime: string | null;
  fixedEndTime: string | null;
  departmentId?: string;
  position: number;
  isActive?: boolean;
  isLinked?: boolean;
  updatedAt: string;
}

export interface PlannerCellMetadata {
  shiftId: string;
  updatedAt: string;
}

export interface PlannerCellMetadataMap {
  [employeeId: string]: {
    [day: number]: PlannerCellMetadata;
  };
}

export interface PlannerEmployeeMetadata {
  updatedAt: string;
}

export interface PlannerEmployeeMetadataMap {
  [employeeId: string]: PlannerEmployeeMetadata;
}

export interface PlannerDepartmentMetadata {
  updatedAt: string;
}

export interface PlannerDepartmentMetadataMap {
  [departmentId: string]: PlannerDepartmentMetadata;
}

export interface WishResponse {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  day: number | null;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface WishMutationInput {
  employeeId: string;
  year: number;
  month: number;
  day: number | null;
  text: string;
}

export interface PlannerServerSnapshot {
  departments: Department[];
  employees: Employee[];
  schedule: ScheduleData;
  wishes: EmployeeWishesData;
  cellMetadata: PlannerCellMetadataMap;
  employeeMetadata: PlannerEmployeeMetadataMap;
  departmentMetadata: PlannerDepartmentMetadataMap;
}

export interface ScheduleCellChange {
  employeeId: string;
  day: number;
  type: 'empty' | 'off' | 'shift';
  startTime?: string;
  endTime?: string;
  code?: string | null;
  expectedUpdatedAt: string | null;
}

export interface ApplyScheduleChangesResponse {
  status: 'ok';
  applied: number;
  schedule: {
    id: string;
    updatedAt: string;
  } | null;
}

export interface SchedulePublicationViolation {
  severity: 'hard' | 'soft';
  code: string;
  message: string;
  employeeId: string | null;
  shiftId: string | null;
  date: string | null;
}

export interface SchedulePublicationValidationResponse {
  departmentId: string;
  period: {
    year: number;
    month: number;
  };
  rulesVersion: string;
  canPublish: boolean;
  violations: SchedulePublicationViolation[];
}

export interface SchedulePublicationResponse {
  id: string;
  scheduleId: string;
  departmentId: string;
  version: number;
  publishedByUserId: string;
  sourceScheduleUpdatedAt: string;
  comment: string | null;
  rulesVersion: string | null;
  snapshot: {
    department: {
      id: string;
      name: string;
      kind: string;
    };
    employees: Array<{
      id: string;
      displayName: string;
      employmentRate: number;
      scheduleMode: string;
      fixedStartTime: string | null;
      fixedEndTime: string | null;
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
  };
  diff: {
    employees: Array<{
      key: string;
      before: unknown;
      after: unknown;
    }>;
    shifts: Array<{
      key: string;
      before: unknown;
      after: unknown;
    }>;
  };
  createdAt: string;
}

export interface EmployeeMutationInput {
  displayName?: string;
  departmentId?: string;
  employmentRate?: EmploymentRate;
  scheduleMode?: 'FLEXIBLE' | 'FIXED_WEEKDAYS';
  fixedStartTime?: string | null;
  fixedEndTime?: string | null;
  expectedUpdatedAt?: string;
}

export interface PlannerDepartmentMutationInput {
  name?: string;
  kind?: DepartmentKind;
  expectedUpdatedAt?: string;
}

export interface DepartmentMutationResponse extends ManageableDepartmentResponse {
  isActive: boolean;
  createdAt: string;
}

const SHIFT_CODES = new Set<ShiftCode>(['E', 'IN', 'INN', 'L', 'N']);

function mapDepartmentKind(
  kind: ManageableDepartmentResponse['kind'],
): DepartmentKind {
  if (kind === 'FO') return 'fo';
  if (kind === 'NIGHT') return 'night';
  return 'general';
}

function mapDepartmentKindToServer(
  kind: DepartmentKind,
): ManageableDepartmentResponse['kind'] {
  if (kind === 'fo') return 'FO';
  if (kind === 'night') return 'NIGHT';
  return 'GENERAL';
}

export function buildDepartmentMutationInput(
  input: PlannerDepartmentMutationInput,
) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.kind !== undefined
      ? { kind: mapDepartmentKindToServer(input.kind) }
      : {}),
    ...(input.expectedUpdatedAt !== undefined
      ? { expectedUpdatedAt: input.expectedUpdatedAt }
      : {}),
  };
}

function mapEmploymentRate(value: number): EmploymentRate {
  if (value === 0.75 || value === 0.5) return value;
  return 1;
}

export function mapEmployeeResponse(
  departmentId: string,
  employee: EmployeeResponse,
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
  manageableDepartments: ManageableDepartmentResponse[] = [],
  wishResponses: WishResponse[] = [],
): PlannerServerSnapshot {
  const departments: Department[] = [];
  const employees: Employee[] = [];
  const schedule: ScheduleData = {};
  const wishes: EmployeeWishesData = {};
  const cellMetadata: PlannerCellMetadataMap = {};
  const employeeMetadata: PlannerEmployeeMetadataMap = {};
  const departmentMetadata: PlannerDepartmentMetadataMap = {};

  manageableDepartments.forEach((department) => {
    departmentMetadata[department.id] = {
      updatedAt: department.updatedAt,
    };
  });

  responses.forEach((response) => {
    departments.push({
      id: response.department.id,
      name: response.department.name,
      kind: mapDepartmentKind(response.department.kind),
    });

    response.employees.forEach((employee) => {
      employees.push(mapEmployeeResponse(response.department.id, employee));
      employeeMetadata[employee.id] = {
        updatedAt: employee.updatedAt,
      };
    });

    response.shifts.forEach((shift) => {
      const day = Number(shift.date.slice(8, 10));
      if (!Number.isInteger(day) || day < 1 || day > 31) return;

      const employeeSchedule = schedule[shift.employeeId] || {};
      const employeeMetadata = cellMetadata[shift.employeeId] || {};

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

      employeeMetadata[day] = {
        shiftId: shift.id,
        updatedAt: shift.updatedAt,
      };
      schedule[shift.employeeId] = employeeSchedule;
      cellMetadata[shift.employeeId] = employeeMetadata;
    });
  });

  wishResponses.forEach((wish) => {
    const periodKey =
      String(wish.year) + '-' + String(wish.month).padStart(2, '0');
    const employeeWishes = wishes[wish.employeeId] || {};
    const periodWishes = employeeWishes[periodKey] || [];

    wishes[wish.employeeId] = {
      ...employeeWishes,
      [periodKey]: [
        ...periodWishes,
        {
          id: wish.id,
          day: wish.day,
          text: wish.text,
        },
      ],
    };
  });

  return {
    departments,
    employees,
    schedule,
    wishes,
    cellMetadata,
    employeeMetadata,
    departmentMetadata,
  };
}

export function buildScheduleCellChange(
  employeeId: string,
  day: number,
  entry: ShiftEntry,
  metadata?: PlannerCellMetadata,
): ScheduleCellChange {
  const base = {
    employeeId,
    day,
    expectedUpdatedAt: metadata?.updatedAt ?? null,
  };

  if (entry.type === 'empty') {
    return { ...base, type: 'empty' };
  }

  if (entry.type === 'off') {
    return { ...base, type: 'off' };
  }

  if (entry.type !== 'shift' || !entry.shift) {
    throw new Error('Cannot persist an invalid schedule entry');
  }

  return {
    ...base,
    type: 'shift',
    startTime: entry.shift.start,
    endTime: entry.shift.end,
    code: entry.shift.code ?? null,
  };
}

export function buildEmployeeMoveInput(
  departmentId: string,
  metadata: PlannerEmployeeMetadata,
): EmployeeMutationInput {
  return {
    departmentId,
    expectedUpdatedAt: metadata.updatedAt,
  };
}

export interface EmployeeReorderInput {
  departmentId: string;
  orderedEmployeeIds: string[];
  expectedUpdatedAtByEmployeeId: Record<string, string>;
}

export function buildEmployeeReorderInput(
  departmentId: string,
  orderedEmployeeIds: string[],
  metadata: PlannerEmployeeMetadataMap,
): EmployeeReorderInput {
  const expectedUpdatedAtByEmployeeId: Record<string, string> = {};

  orderedEmployeeIds.forEach((employeeId) => {
    const employeeMetadata = metadata[employeeId];
    if (!employeeMetadata) {
      throw new Error('Missing Employee optimistic metadata for reorder');
    }
    expectedUpdatedAtByEmployeeId[employeeId] = employeeMetadata.updatedAt;
  });

  return {
    departmentId,
    orderedEmployeeIds,
    expectedUpdatedAtByEmployeeId,
  };
}

export interface DepartmentReorderInput {
  orderedDepartmentIds: string[];
  expectedUpdatedAtByDepartmentId: Record<string, string>;
}

export function buildDepartmentReorderInput(
  orderedDepartmentIds: string[],
  metadata: PlannerDepartmentMetadataMap,
): DepartmentReorderInput {
  const expectedUpdatedAtByDepartmentId: Record<string, string> = {};

  orderedDepartmentIds.forEach((departmentId) => {
    const departmentMetadata = metadata[departmentId];
    if (!departmentMetadata) {
      throw new Error('Missing Department optimistic metadata for reorder');
    }
    expectedUpdatedAtByDepartmentId[departmentId] =
      departmentMetadata.updatedAt;
  });

  return {
    orderedDepartmentIds,
    expectedUpdatedAtByDepartmentId,
  };
}

export function createPlannerDepartment(
  input: PlannerDepartmentMutationInput,
) {
  return apiRequest<DepartmentMutationResponse>('/departments', {
    method: 'POST',
    body: JSON.stringify(buildDepartmentMutationInput(input)),
  });
}

export function updatePlannerDepartment(
  departmentId: string,
  input: PlannerDepartmentMutationInput,
) {
  return apiRequest<DepartmentMutationResponse>(
    '/departments/' + encodeURIComponent(departmentId),
    {
      method: 'PATCH',
      body: JSON.stringify(buildDepartmentMutationInput(input)),
    },
  );
}

export function deactivatePlannerDepartment(
  departmentId: string,
  expectedUpdatedAt: string,
) {
  return apiRequest<{ status: 'ok'; departmentId: string }>(
    '/departments/' + encodeURIComponent(departmentId) + '/deactivate',
    {
      method: 'PATCH',
      body: JSON.stringify({ expectedUpdatedAt }),
    },
  );
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

export function getDepartmentWishes(
  departmentId: string,
  year: number,
  month: number,
) {
  const params = new URLSearchParams({
    departmentId,
    year: String(year),
    month: String(month),
  });

  return apiRequest<WishResponse[]>(
    '/wishes/department?' + params.toString(),
  );
}

export function createPlannerWish(input: WishMutationInput) {
  return apiRequest<WishResponse>('/wishes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deletePlannerWish(wishId: string) {
  return apiRequest<{ status: 'ok'; wishId: string }>(
    '/wishes/' + encodeURIComponent(wishId),
    {
      method: 'DELETE',
    },
  );
}

export async function loadPlannerServerSnapshot(
  year: number,
  month: number,
): Promise<PlannerServerSnapshot> {
  const departments = await getManageableDepartments();
  const [responses, departmentWishResponses] = await Promise.all([
    Promise.all(
      departments.map((department) =>
        getDepartmentPlannerSchedule(department.id, year, month),
      ),
    ),
    Promise.all(
      departments.map((department) =>
        getDepartmentWishes(department.id, year, month),
      ),
    ),
  ]);

  return mapDepartmentScheduleResponses(
    responses,
    departments,
    departmentWishResponses.flat(),
  );
}

export function validateDepartmentSchedule(
  departmentId: string,
  year: number,
  month: number,
) {
  const params = new URLSearchParams({
    departmentId,
    year: String(year),
    month: String(month),
  });

  return apiRequest<SchedulePublicationValidationResponse>(
    '/schedule-data/department/validation?' + params.toString(),
  );
}

export function publishDepartmentSchedule(
  departmentId: string,
  year: number,
  month: number,
  comment?: string,
) {
  return apiRequest<SchedulePublicationResponse>(
    '/schedule-data/department/publish',
    {
      method: 'POST',
      body: JSON.stringify({
        departmentId,
        year,
        month,
        ...(comment?.trim() ? { comment: comment.trim() } : {}),
      }),
    },
  );
}

export function getDepartmentSchedulePublications(
  departmentId: string,
  year: number,
  month: number,
) {
  const params = new URLSearchParams({
    departmentId,
    year: String(year),
    month: String(month),
  });

  return apiRequest<SchedulePublicationResponse[]>(
    '/schedule-data/department/publications?' + params.toString(),
  );
}

export function getDepartmentSchedulePublication(
  departmentId: string,
  year: number,
  month: number,
  version: number,
) {
  const params = new URLSearchParams({
    departmentId,
    year: String(year),
    month: String(month),
    version: String(version),
  });

  return apiRequest<SchedulePublicationResponse>(
    '/schedule-data/department/publication?' + params.toString(),
  );
}

export function applyDepartmentScheduleChanges(
  departmentId: string,
  year: number,
  month: number,
  changes: ScheduleCellChange[],
) {
  return apiRequest<ApplyScheduleChangesResponse>(
    '/schedule-data/department/entries',
    {
      method: 'PATCH',
      body: JSON.stringify({
        departmentId,
        year,
        month,
        changes,
      }),
    },
  );
}

export function applyPlannerScheduleChanges(
  year: number,
  month: number,
  changes: ScheduleCellChange[],
) {
  return apiRequest<ApplyScheduleChangesResponse>(
    '/schedule-data/planner/entries',
    {
      method: 'PATCH',
      body: JSON.stringify({
        year,
        month,
        changes,
      }),
    },
  );
}

export function createPlannerEmployee(input: EmployeeMutationInput) {
  return apiRequest<EmployeeResponse>('/employees', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updatePlannerEmployee(
  employeeId: string,
  input: EmployeeMutationInput,
) {
  return apiRequest<EmployeeResponse>('/employees/' + encodeURIComponent(employeeId), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deactivatePlannerEmployee(
  employeeId: string,
  expectedUpdatedAt: string,
) {
  return apiRequest<{ status: 'ok'; employeeId: string }>(
    '/employees/' + encodeURIComponent(employeeId) + '/deactivate',
    {
      method: 'PATCH',
      body: JSON.stringify({ expectedUpdatedAt }),
    },
  );
}

export function reorderPlannerEmployees(input: EmployeeReorderInput) {
  return apiRequest<{ status: 'ok'; reordered: number }>('/employees/reorder', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function reorderPlannerDepartments(input: DepartmentReorderInput) {
  return apiRequest<{ status: 'ok'; reordered: number }>('/departments/reorder', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function saveFixedWeekdaysSchedule(year: number, month: number, departmentIds: string[]) {
  return apiRequest<{ status: 'ok'; created: number }>('/schedule-data/planner/fixed-weekdays', {
    method: 'POST',
    body: JSON.stringify({ year, month, departmentIds }),
  });
}
