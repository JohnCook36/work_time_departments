import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@emotion/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';

import { IconButton } from '../styles';
import {
  AdminOnboardingRequest,
  OnboardingDepartment,
  ApiError,
  approveOnboardingRequest,
  getAdminOnboardingDepartments,
  getAdminPendingOnboardingRequests,
  rejectOnboardingRequest,
} from './api';

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
  const theme = useTheme();
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
            <motion.div
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
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 12000,
                display: 'flex',
                justifyContent: 'flex-end',
                background: theme.colors.overlay,
              }}
            >
              <motion.aside
                initial={
                  reduceMotion ? false : { opacity: 0, x: 36 }
                }
                animate={{ opacity: 1, x: 0 }}
                exit={
                  reduceMotion ? undefined : { opacity: 0, x: 36 }
                }
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  width: 'min(520px, 100%)',
                  height: '100%',
                  overflowY: 'auto',
                  padding: 20,
                  background: theme.colors.surfaceElevated,
                  color: theme.colors.text,
                  borderLeft: '1px solid ' + theme.colors.border,
                  boxShadow: theme.shadows.drawer,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 800,
                        fontSize: 18,
                      }}
                    >
                      <ShieldCheck size={20} />
                      Привязка аккаунтов
                    </div>
                    <div
                      style={{
                        marginTop: 5,
                        color: theme.colors.textMuted,
                        fontSize: 13,
                        lineHeight: 1.45,
                      }}
                    >
                      Аккаунт станет сотрудником только после подтверждения
                      руководителем.
                    </div>
                  </div>

                  <IconButton
                    type="button"
                    title="Закрыть"
                    onClick={() => setOpen(false)}
                  >
                    <X size={18} />
                  </IconButton>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 18,
                  }}
                >
                  <select
                    value={selectedDepartmentId}
                    onChange={(event) =>
                      setSelectedDepartmentId(event.target.value)
                    }
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 40,
                      borderRadius: 10,
                      border: '1px solid ' + theme.colors.border,
                      background: theme.colors.surface,
                      color: theme.colors.text,
                      padding: '0 10px',
                    }}
                  >
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>

                  <IconButton
                    type="button"
                    title="Обновить"
                    onClick={() => void loadRequests()}
                  >
                    <RefreshCw size={17} />
                  </IconButton>
                </div>

                {error && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      borderRadius: 10,
                      background: theme.colors.dangerSoft,
                      color: theme.colors.danger,
                      fontSize: 13,
                    }}
                  >
                    {error}
                  </div>
                )}

                <div style={{ marginTop: 16 }}>
                  {loading ? (
                    <div
                      style={{
                        padding: 20,
                        textAlign: 'center',
                        color: theme.colors.textMuted,
                      }}
                    >
                      Загружаем заявки…
                    </div>
                  ) : requests.length === 0 ? (
                    <div
                      style={{
                        padding: 22,
                        borderRadius: 14,
                        border: '1px dashed ' + theme.colors.border,
                        textAlign: 'center',
                        color: theme.colors.textMuted,
                      }}
                    >
                      Для отдела «{selectedDepartment?.name || '—'}» новых
                      заявок нет.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {requests.map((request) => {
                        const busy = busyRequestId === request.id;

                        return (
                          <motion.div
                            layout={!reduceMotion}
                            key={request.id}
                            style={{
                              padding: 14,
                              borderRadius: 14,
                              border: '1px solid ' + theme.colors.border,
                              background: theme.colors.surface,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 12,
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 800,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {requestLabel(request)}
                                </div>
                                <div
                                  style={{
                                    marginTop: 4,
                                    color: theme.colors.textMuted,
                                    fontSize: 12,
                                  }}
                                >
                                  {request.type === 'LINK_EXISTING'
                                    ? 'Привязка к существующему сотруднику'
                                    : 'Создание нового профиля'}
                                  {' • '}
                                  {maskPhone(request.user.phoneE164)}
                                </div>
                                <div
                                  style={{
                                    marginTop: 3,
                                    color: theme.colors.textMuted,
                                    fontSize: 11,
                                  }}
                                >
                                  {new Date(
                                    request.createdAt,
                                  ).toLocaleString('ru-RU')}
                                </div>
                              </div>
                            </div>

                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: 8,
                                marginTop: 12,
                              }}
                            >
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void resolve(request, 'reject')
                                }
                                style={{
                                  minHeight: 38,
                                  borderRadius: 10,
                                  border:
                                    '1px solid ' + theme.colors.border,
                                  background: theme.colors.dangerSoft,
                                  color: theme.colors.danger,
                                  fontWeight: 800,
                                  cursor: busy ? 'wait' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 7,
                                }}
                              >
                                <X size={16} />
                                Отклонить
                              </button>

                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void resolve(request, 'approve')
                                }
                                style={{
                                  minHeight: 38,
                                  borderRadius: 10,
                                  border: 0,
                                  background: theme.colors.primary,
                                  color: theme.colors.onPrimary,
                                  fontWeight: 800,
                                  cursor: busy ? 'wait' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 7,
                                }}
                              >
                                <Check size={16} />
                                {busy ? 'Обработка…' : 'Подтвердить'}
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
