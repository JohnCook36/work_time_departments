import { apiRequest } from './auth';

export type ShiftChangeKind = 'SWAP' | 'COVER';
export type ShiftChangeStatus = 'PENDING_TARGET' | 'PENDING_MANAGER' | 'TARGET_REJECTED' | 'MANAGER_APPROVED' | 'MANAGER_REJECTED' | 'CANCELED' | 'STALE';

export interface ShiftDetails {
  date: string;
  startTime: string | null;
  endTime: string | null;
  code: string | null;
  isOff: boolean;
}

export interface ShiftChangeRequest {
  id: string;
  kind: ShiftChangeKind;
  status: ShiftChangeStatus;
  requesterEmployeeId: string;
  targetEmployeeId: string;
  requesterEmployee: { displayName: string };
  targetEmployee: { displayName: string };
  requesterShift: ShiftDetails;
  targetShift: ShiftDetails | null;
  createdAt: string;
}

export interface ShiftChangeTarget { id: string; displayName: string }
export interface ShiftChangeTargetShift { id: string; date: string; startTime: string; endTime: string; code: string | null }

export const shiftChangeStatusLabel: Record<ShiftChangeStatus, string> = {
  PENDING_TARGET: 'Ожидает ответа сотрудника',
  PENDING_MANAGER: 'Ожидает решения руководителя',
  TARGET_REJECTED: 'Сотрудник отказался',
  MANAGER_APPROVED: 'Одобрено руководителем',
  MANAGER_REJECTED: 'Отклонено руководителем',
  CANCELED: 'Отменено',
  STALE: 'Запрос устарел — исходная смена изменилась',
};

export const shiftChangeKindLabel: Record<ShiftChangeKind, string> = {
  SWAP: 'Обмен сменами',
  COVER: 'Подмена',
};

const prefix = '/shift-change-requests';

export const getShiftChangeTargets = () => apiRequest<ShiftChangeTarget[]>(prefix + '/discovery/targets');
export const getShiftChangeTargetShift = (employeeId: string, date: string, sourceShiftId: string) =>
  apiRequest<ShiftChangeTargetShift>(prefix + '/discovery/targets/' + encodeURIComponent(employeeId) + '/shift?date=' + encodeURIComponent(date) + '&sourceShiftId=' + encodeURIComponent(sourceShiftId));
export const getMyShiftChangeRequests = () => apiRequest<ShiftChangeRequest[]>(prefix + '/mine');
export const getIncomingShiftChangeRequests = () => apiRequest<ShiftChangeRequest[]>(prefix + '/incoming');
export const getPendingShiftChangeRequests = () => apiRequest<ShiftChangeRequest[]>(prefix + '/admin/pending');
export const createShiftChangeRequest = (input: { kind: ShiftChangeKind; requesterShiftId: string; targetEmployeeId: string; targetShiftId?: string }) =>
  apiRequest<ShiftChangeRequest>(prefix, { method: 'POST', body: JSON.stringify(input) });
export const respondToShiftChangeRequest = (id: string, action: 'accept' | 'reject' | 'cancel' | 'admin/approve' | 'admin/reject') =>
  apiRequest<ShiftChangeRequest>(prefix + '/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
