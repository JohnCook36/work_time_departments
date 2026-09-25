export interface AuthUser {
  id: string;
  phoneE164: string;
  employee: {
    id: string;
    displayName: string;
    departmentId: string;
    departmentName?: string;
    employmentRate: number;
    scheduleMode: 'FLEXIBLE' | 'FIXED_WEEKDAYS';
    fixedStartTime: string | null;
    fixedEndTime: string | null;
  } | null;
  memberships: Array<{
    id: string;
    role: string;
    departmentId: string | null;
    permissions?: string[];
  }>;
}

export interface OnboardingDepartment {
  id: string;
  name: string;
  kind: string;
}

export interface EmployeeCandidate {
  id: string;
  displayName: string;
  departmentId: string;
}

export interface OnboardingRequest {
  id: string;
  type: 'LINK_EXISTING' | 'CREATE_EMPLOYEE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  departmentId: string;
  employeeId: string | null;
  requestedDisplayName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOnboardingRequest extends OnboardingRequest {
  employee: {
    id: string;
    displayName: string;
  } | null;
}

const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:3000'
).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = 'Запрос не выполнен';

    try {
      const payload = (await response.json()) as {
        message?: string | string[];
      };
      if (Array.isArray(payload.message)) {
        message = payload.message.join(', ');
      } else if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Keep the generic message if the server returned no JSON body.
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.text();
  if (payload.trim() === '') {
    return undefined as T;
  }

  return JSON.parse(payload) as T;
}

export function requestOtp(phone: string) {
  return apiRequest<{ status: 'sent'; expiresInSeconds: number }>(
    '/auth/request-code',
    {
      method: 'POST',
      body: JSON.stringify({ phone }),
    },
  );
}

export function verifyOtp(phone: string, code: string) {
  return apiRequest<{
    expiresAt: string;
    user: {
      id: string;
      phoneE164: string;
      onboardingRequired: boolean;
    };
  }>('/auth/verify-code', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
}

export function getMe() {
  return apiRequest<AuthUser>('/auth/me');
}

export function logout() {
  return apiRequest<{ status: 'ok' }>('/auth/logout', {
    method: 'POST',
  });
}

export function getOnboardingDepartments() {
  return apiRequest<OnboardingDepartment[]>('/onboarding/departments');
}

export function searchEmployeeCandidates(
  departmentId: string,
  query: string,
) {
  const params = new URLSearchParams({ departmentId, query });
  return apiRequest<EmployeeCandidate[]>(
    '/onboarding/candidates?' + params.toString(),
  );
}

export async function getOnboardingStatus() {
  const status = await apiRequest<OnboardingRequest | null | undefined>(
    '/onboarding/status',
  );

  return status ?? null;
}

export function requestExistingEmployeeLink(employeeId: string) {
  return apiRequest<OnboardingRequest>('/onboarding/link-request', {
    method: 'POST',
    body: JSON.stringify({ employeeId }),
  });
}

export function requestNewEmployeeRegistration(
  displayName: string,
  departmentId: string,
) {
  return apiRequest<OnboardingRequest>('/onboarding/registration-request', {
    method: 'POST',
    body: JSON.stringify({ displayName, departmentId }),
  });
}

export function cancelOnboardingRequest() {
  return apiRequest<OnboardingRequest>('/onboarding/cancel', {
    method: 'POST',
  });
}


export function getAdminOnboardingDepartments() {
  return apiRequest<OnboardingDepartment[]>('/onboarding/admin/departments');
}

export function getAdminPendingOnboardingRequests(departmentId: string) {
  const params = new URLSearchParams({ departmentId });
  return apiRequest<AdminOnboardingRequest[]>(
    '/onboarding/admin/pending?' + params.toString(),
  );
}

export function approveOnboardingRequest(requestId: string) {
  return apiRequest<{
    request: OnboardingRequest;
    employee: {
      id: string;
      displayName: string;
      departmentId: string;
    };
  }>('/onboarding/admin/' + encodeURIComponent(requestId) + '/approve', {
    method: 'POST',
  });
}

export function rejectOnboardingRequest(requestId: string) {
  return apiRequest<OnboardingRequest>(
    '/onboarding/admin/' + encodeURIComponent(requestId) + '/reject',
    { method: 'POST' },
  );
}


export interface MyScheduleShift {
  id: string;
  employeeId: string;
  date: string;
  code: string | null;
  startTime: string | null;
  endTime: string | null;
  isOff: boolean;
  updatedAt: string;
}

export interface MyScheduleResponse {
  period: {
    year: number;
    month: number;
  };
  schedule: {
    id: string;
    updatedAt: string;
  } | null;
  employee: {
    id: string;
    displayName: string;
    employmentRate: number;
    scheduleMode: 'FLEXIBLE' | 'FIXED_WEEKDAYS';
    fixedStartTime: string | null;
    fixedEndTime: string | null;
    department: {
      id: string;
      name: string;
      kind: string;
    };
  };
  shifts: MyScheduleShift[];
}

export function getMySchedule(year: number, month: number) {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });

  return apiRequest<MyScheduleResponse>(
    '/schedule-data/me?' + params.toString(),
  );
}
