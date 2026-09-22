import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Check,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';

import { IconButton } from '../../theme/styles';
import {
  AdminControls,
  AdminDepartmentSelect,
  AdminDescription,
  AdminDrawer,
  AdminError,
  AdminHeader,
  AdminOverlay,
  AdminTitle,
  ApproveButton,
  RejectButton,
  RequestActions,
  RequestBody,
  RequestCard,
  RequestHeader,
  RequestMeta,
  RequestName,
  RequestsEmpty,
  RequestsList,
  RequestsLoading,
  RequestsSection,
  RequestTimestamp,
} from './AdminOnboardingPanel.styles';
import {
  AdminOnboardingRequest,
  OnboardingDepartment,
  ApiError,
  approveOnboardingRequest,
  getAdminOnboardingDepartments,
  getAdminPendingOnboardingRequests,
  rejectOnboardingRequest,
} from '../../api/auth';

function maskPhone(value: string): string {
  const compact = value.replace(/\s+/g, '');
  if (compact.length <= 5) return compact;

  return compact.slice(0, 3) + '•••' + compact.slice(-2);
}

function requestLabel(request: AdminOnboardingRequest): string {
  if (request.type === 'LINK_EXISTING') {
    return request.employee?.displayName || 'Существующий профиль сотрудника';
  }

  return request.requestedDisplayName || 'Новый профиль сотрудника';
}

export function AdminOnboardingPanel() {
  const reduceMotion = useReducedMotion();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [departments, setDepartments] = useState<OnboardingDepartment[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [requests, setRequests] = useState<AdminOnboardingRequest[]>([]);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDepartment = useMemo(
    () =>
      departments.find(
        (department) => department.id === selectedDepartmentId,
      ) || null,
    [departments, selectedDepartmentId],
  );

  const loadDepartments = useCallback(async () => {
    try {
      const next = await getAdminOnboardingDepartments();
      setDepartments(next);
      setSelectedDepartmentId((current) =>
        current && next.some((department) => department.id === current)
          ? current
          : next[0]?.id || '',
      );
      setAvailable(next.length > 0);
    } catch (requestError) {
      if (
        requestError instanceof ApiError &&
        (requestError.status === 401 || requestError.status === 403)
      ) {
        setAvailable(false);
        return;
      }

      setAvailable(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    if (!selectedDepartmentId) {
      setRequests([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setRequests(
        await getAdminPendingOnboardingRequests(selectedDepartmentId),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось загрузить заявки',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedDepartmentId]);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    if (open) {
      void loadRequests();
    }
  }, [open, loadRequests]);

  if (available !== true) {
    return null;
  }

  const resolve = async (
    request: AdminOnboardingRequest,
    action: 'approve' | 'reject',
  ) => {
    setBusyRequestId(request.id);
    setError(null);

    try {
      if (action === 'approve') {
        await approveOnboardingRequest(request.id);
      } else {
        await rejectOnboardingRequest(request.id);
      }

      await loadRequests();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось обработать заявку',
      );
    } finally {
      setBusyRequestId(null);
    }
  };

  return (
    <>
      <IconButton
        type="button"
        title="Заявки на привязку аккаунтов"
        onClick={() => setOpen(true)}
      >
        <UserCheck size={18} />
      </IconButton>

      {createPortal(
        <AnimatePresence>
          {open && (
            <AdminOverlay
              key="admin-onboarding-overlay"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.16 }}
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) {
                  setOpen(false);
                }
              }}
            >
              <AdminDrawer
                initial={
                  reduceMotion ? false : { opacity: 0, x: 36 }
                }
                animate={{ opacity: 1, x: 0 }}
                exit={
                  reduceMotion ? undefined : { opacity: 0, x: 36 }
                }
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <AdminHeader>
                  <div>
                    <AdminTitle>
                      <ShieldCheck size={20} />
                      Привязка аккаунтов
                    </AdminTitle>
                    <AdminDescription>
                      Аккаунт станет сотрудником только после подтверждения
                      руководителем.
                    </AdminDescription>
                  </div>

                  <IconButton
                    type="button"
                    title="Закрыть"
                    onClick={() => setOpen(false)}
                  >
                    <X size={18} />
                  </IconButton>
                </AdminHeader>

                <AdminControls>
                  <AdminDepartmentSelect
                    value={selectedDepartmentId}
                    onChange={(event) =>
                      setSelectedDepartmentId(event.target.value)
                    }
                  >
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </AdminDepartmentSelect>

                  <IconButton
                    type="button"
                    title="Обновить"
                    onClick={() => void loadRequests()}
                  >
                    <RefreshCw size={17} />
                  </IconButton>
                </AdminControls>

                {error && (
                  <AdminError>{error}</AdminError>
                )}

                <RequestsSection>
                  {loading ? (
                    <RequestsLoading>Загружаем заявки…</RequestsLoading>
                  ) : requests.length === 0 ? (
                    <RequestsEmpty>
                      Для отдела «{selectedDepartment?.name || '—'}» новых
                      заявок нет.
                    </RequestsEmpty>
                  ) : (
                    <RequestsList>
                      {requests.map((request) => {
                        const busy = busyRequestId === request.id;

                        return (
                          <RequestCard
                            layout={!reduceMotion}
                            key={request.id}
                          >
                            <RequestHeader>
                              <RequestBody>
                                <RequestName>
                                  {requestLabel(request)}
                                </RequestName>
                                <RequestMeta>
                                  {request.type === 'LINK_EXISTING'
                                    ? 'Привязка к существующему сотруднику'
                                    : 'Создание нового профиля'}
                                  {' • '}
                                  {maskPhone(request.user.phoneE164)}
                                </RequestMeta>
                                <RequestTimestamp>
                                  {new Date(
                                    request.createdAt,
                                  ).toLocaleString('ru-RU')}
                                </RequestTimestamp>
                              </RequestBody>
                            </RequestHeader>

                            <RequestActions>
                              <RejectButton
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void resolve(request, 'reject')
                                }
                              >
                                <X size={16} />
                                Отклонить
                              </RejectButton>

                              <ApproveButton
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void resolve(request, 'approve')
                                }
                              >
                                <Check size={16} />
                                {busy ? 'Обработка…' : 'Подтвердить'}
                              </ApproveButton>
                            </RequestActions>
                          </RequestCard>
                        );
                      })}
                    </RequestsList>
                  )}
                </RequestsSection>
              </AdminDrawer>
            </AdminOverlay>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
