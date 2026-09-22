import React, { useCallback, useEffect, useState } from 'react';
import { Clock3, LogOut, Search, UserPlus } from 'lucide-react';
import { EmployeeCandidate, OnboardingDepartment, OnboardingRequest,
  cancelOnboardingRequest, getOnboardingDepartments, getOnboardingStatus, logout,
  requestExistingEmployeeLink, requestNewEmployeeRegistration, searchEmployeeCandidates,
} from '../auth/api';
import { useAuthUser } from '../auth/AuthContext';
import { useAuthSession } from '../auth/AuthSessionProvider';
import { pageStyle, cardStyle, inputStyle, buttonStyle, secondaryButtonStyle, ErrorText } from '../auth/authPageUi';

function PendingRequest({
  request,
  onCanceled,
  onRefresh,
}: {
  request: OnboardingRequest;
  onCanceled: () => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: 12,
        border: '1px solid rgba(245,158,11,.28)',
        background: 'rgba(245,158,11,.07)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontWeight: 800,
        }}
      >
        <Clock3 size={17} />
        Запрос ожидает подтверждения администратора
      </div>
      <p style={{ margin: '8px 0 0', color: '#cbd5e1', fontSize: 13 }}>
        До подтверждения профиль сотрудника не привязывается к аккаунту.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" style={secondaryButtonStyle} onClick={onRefresh}>
          Проверить статус
        </button>
        <button
          type="button"
          style={secondaryButtonStyle}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await cancelOnboardingRequest();
              onCanceled();
            } finally {
              setBusy(false);
            }
          }}
        >
          Отменить запрос
        </button>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const user = useAuthUser();
  const { refresh: onSessionChanged } = useAuthSession();
  const [departments, setDepartments] = useState<OnboardingDepartment[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<EmployeeCandidate[]>([]);
  const [status, setStatus] = useState<OnboardingRequest | null>(null);
  const [registrationName, setRegistrationName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      const [nextStatus, nextDepartments] = await Promise.all([
        getOnboardingStatus(),
        getOnboardingDepartments(),
      ]);

      setStatus(nextStatus);
      setDepartments(nextDepartments);
      setDepartmentId((current) => current || nextDepartments[0]?.id || '');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось загрузить регистрацию',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status?.status === 'PENDING') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ margin: '0 0 6px', fontSize: 24 }}>
            Привязка профиля
          </h1>
          <p style={{ margin: 0, color: '#94a3b8' }}>
            Телефон подтверждён. Осталось подтвердить профиль сотрудника.
          </p>
          <PendingRequest
            request={status}
            onCanceled={() => {
              setStatus(null);
              void load();
            }}
            onRefresh={onSessionChanged}
          />
          <button
            type="button"
            style={{ ...secondaryButtonStyle, marginTop: 14 }}
            onClick={async () => {
              await logout();
              onSessionChanged();
            }}
          >
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24 }}>
          Найдите свой профиль
        </h1>
        <p style={{ margin: '0 0 18px', color: '#94a3b8', lineHeight: 1.5 }}>
          Для защиты от чужой привязки выбор профиля создаёт запрос. Сам профиль
          будет связан с аккаунтом только после подтверждения администратора.
        </p>

        <label style={{ display: 'grid', gap: 7, fontSize: 13 }}>
          Отдел
          <select
            style={inputStyle}
            value={departmentId}
            onChange={(event) => {
              setDepartmentId(event.target.value);
              setCandidates([]);
            }}
            disabled={busy}
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 8,
            marginTop: 12,
          }}
        >
          <input
            style={inputStyle}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Начните вводить имя"
          />
          <button
            type="button"
            style={buttonStyle}
            disabled={busy || !departmentId || query.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setCandidates(
                  await searchEmployeeCandidates(departmentId, query),
                );
              } catch (requestError) {
                setError(
                  requestError instanceof Error
                    ? requestError.message
                    : 'Поиск не выполнен',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Search size={16} />
            Найти
          </button>
        </div>

        {candidates.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                style={{
                  ...secondaryButtonStyle,
                  justifyContent: 'space-between',
                  textAlign: 'left',
                }}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    setStatus(
                      await requestExistingEmployeeLink(candidate.id),
                    );
                  } catch (requestError) {
                    setError(
                      requestError instanceof Error
                        ? requestError.message
                        : 'Не удалось создать запрос',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <span>{candidate.displayName}</span>
                <UserPlus size={16} />
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid rgba(148,163,184,.17)',
          }}
        >
          <div style={{ fontWeight: 800 }}>Нет профиля в графике?</div>
          <p style={{ margin: '5px 0 10px', color: '#94a3b8', fontSize: 13 }}>
            Отправьте администратору запрос на создание нового профиля в
            выбранном отделе.
          </p>
          <input
            style={inputStyle}
            value={registrationName}
            onChange={(event) => setRegistrationName(event.target.value)}
            placeholder="Имя и фамилия"
          />
          <button
            type="button"
            style={{ ...buttonStyle, width: '100%', marginTop: 8 }}
            disabled={
              busy ||
              !departmentId ||
              registrationName.trim().length < 3
            }
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setStatus(
                  await requestNewEmployeeRegistration(
                    registrationName,
                    departmentId,
                  ),
                );
              } catch (requestError) {
                setError(
                  requestError instanceof Error
                    ? requestError.message
                    : 'Не удалось создать запрос',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <UserPlus size={16} />
            Запросить создание профиля
          </button>
        </div>

        <ErrorText message={error} />

        <button
          type="button"
          style={{ ...secondaryButtonStyle, marginTop: 14 }}
          onClick={async () => {
            await logout();
            onSessionChanged();
          }}
        >
          <LogOut size={16} />
          Выйти
        </button>

        <div style={{ marginTop: 12, color: '#64748b', fontSize: 11 }}>
          Аккаунт: {user.phoneE164}
        </div>
      </div>
    </div>
  );
}
