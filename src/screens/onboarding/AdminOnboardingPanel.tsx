import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Check,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';

import { ActionButton, IconButton } from '../../theme/styles';
import {
  AdminControls,
  AdminDepartmentSelect,
  AdminDescription,
  AdminDrawer,
  AdminError,
  AdminHeader,
  AdminOverlay,
  AdminTitle,
  AdminTrigger,
  AdminPendingBadge,
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
  PendingNotification,
  PendingNotificationActions,
  PendingNotificationHeader,
  PendingNotificationText,
  PendingNotificationTitle,
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
  const [pendingCount, setPendingCount] = useState(0);
  const [showPendingNotification, setShowPendingNotification] =
    useState(false);
  const lastPendingCountRef = useRef(0);

  const selectedDepartment = useMemo(
    () =>
      departments.find(
        (department) => department.id === selectedDepartmentId,
      ) || null,
    [departments, selectedDepartmentId],
  );

  const refreshPendingSummary = useCallback(
    async (sourceDepartments: OnboardingDepartment[]) => {
      if (sourceDepartments.length === 0) {
        setPendingCount(0);
        lastPendingCountRef.current = 0;
        return;
      }

      try {
        const pendingByDepartment = await Promise.all(
          sourceDepartments.map((department) =>
            getAdminPendingOnboardingRequests(department.id),
          ),
        );
        const nextCount = pendingByDepartment.reduce(
          (total, departmentRequests) =>
            total + departmentRequests.length,
          0,
        );

        if (nextCount > lastPendingCountRef.current) {
          setShowPendingNotification(true);
        }

        lastPendingCountRef.current = nextCount;
        setPendingCount(nextCount);
      } catch (requestError) {
        console.error(
          'Admin onboarding pending summary failed',
          requestError,
        );
      }
    },
    [],
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
      await refreshPendingSummary(next);
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
  }, [refreshPendingSummary]);

  const loadRequests = useCallback(async () => {
    if (!selectedDepartmentId) {
      setRequests([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextRequests =
        await getAdminPendingOnboardingRequests(selectedDepartmentId);
      setRequests(nextRequests);
      void refreshPendingSummary(departments);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось загрузить заявки',
      );
    } finally {
      setLoading(false);
    }
  }, [
    departments,
    refreshPendingSummary,
    selectedDepartmentId,
  ]);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    if (open) {
      void loadRequests();
    }
  }, [open, loadRequests]);

  useEffect(() => {
    if (available !== true || departments.length === 0) return;

    const intervalId = window.setInterval(() => {
      void refreshPendingSummary(departments);
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [available, departments, refreshPendingSummary]);

  const openPanel = () => {
    setShowPendingNotification(false);
    setOpen(true);
  };

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
      <AdminTrigger>
        <IconButton
          type="button"
          title={
            pendingCount > 0
              ? 'Заявки на привязку аккаунтов: ' + pendingCount
              : 'Заявки на привязку аккаунтов'
          }
          onClick={openPanel}
        >
          <UserCheck size={18} />
        </IconButton>
        {pendingCount > 0 && (
          <AdminPendingBadge aria-hidden="true">
            {pendingCount > 99 ? '99+' : pendingCount}
          </AdminPendingBadge>
        )}
      </AdminTrigger>

      {showPendingNotification && pendingCount > 0 && !open && (
        <PendingNotification role="status" aria-live="polite">
          <PendingNotificationHeader>
            <div>
              <PendingNotificationTitle>
                {pendingCount === 1
                  ? 'Новая заявка на привязку аккаунта'
                  : 'Новые заявки на привязку аккаунтов'}
              </PendingNotificationTitle>
              <PendingNotificationText>
                {pendingCount === 1
                  ? 'Один сотрудник ожидает подтверждения руководителем.'
                  : pendingCount +
                    ' сотрудников ожидают подтверждения руководителем.'}
              </PendingNotificationText>
            </div>

            <IconButton
              type="button"
              title="Скрыть уведомление"
              onClick={() => setShowPendingNotification(false)}
            >
              <X size={16} />
            </IconButton>
          </PendingNotificationHeader>

          <PendingNotificationActions>
            <ActionButton
              type="button"
              $variant="primary"
              onClick={openPanel}
            >
              Открыть заявки
            </ActionButton>
          </PendingNotificationActions>
        </PendingNotification>
      )}

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
