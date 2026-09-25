import { apiRequest } from './auth';

export type AuditAction =
  | 'EMPLOYEE_DEACTIVATED'
  | 'DEPARTMENT_DEACTIVATED'
  | 'SCHEDULE_CHANGED'
  | 'SCHEDULE_PUBLISHED'
  | 'SCHEDULE_RULE_CREATED'
  | 'SCHEDULE_RULE_UPDATED'
  | 'SCHEDULE_RULE_DELETED'
  | 'ONBOARDING_APPROVED'
  | 'ONBOARDING_REJECTED'
  | 'SHIFT_CHANGE_MANAGER_APPROVED'
  | 'SHIFT_CHANGE_MANAGER_REJECTED'
  | 'ROLE_ASSIGNMENT_CREATED'
  | 'ROLE_PERMISSIONS_UPDATED'
  | 'ROLE_ASSIGNMENT_DEACTIVATED';

export type AuditEntityType =
  | 'EMPLOYEE'
  | 'DEPARTMENT'
  | 'SCHEDULE'
  | 'SCHEDULE_RULE'
  | 'ONBOARDING_REQUEST'
  | 'SHIFT_CHANGE_REQUEST'
  | 'MEMBERSHIP';

export interface AuditEvent {
  id: string;
  action: AuditAction | string;
  entityType: AuditEntityType | string;
  entityId: string;
  departmentId: string | null;
  actorLabel: string;
  createdAt: string;
}

export interface AuditPage {
  items: AuditEvent[];
  nextCursor: string | null;
}

export interface AuditFilters {
  departmentId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export function getAuditEvents(filters: AuditFilters = {}) {
  const params = new URLSearchParams();
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  if (filters.action) params.set('action', filters.action);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));

  const query = params.toString();
  return apiRequest<AuditPage>('/audit-events' + (query ? '?' + query : ''));
}
