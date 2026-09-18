import { ReactNode, useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  Search,
  UserPlus,
} from 'lucide-react';

import {
  ApiError,
  AuthUser,
  EmployeeCandidate,
  OnboardingDepartment,
  OnboardingRequest,
  cancelOnboardingRequest,
  getMe,
  getOnboardingDepartments,
  getOnboardingStatus,
  logout,
  requestExistingEmployeeLink,
  requestNewEmployeeRegistration,
  requestOtp,
  searchEmployeeCandidates,
  verifyOtp,
} from './api';

interface AuthGateProps {
  children: ReactNode;
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  background:
    'radial-gradient(circle at top, rgba(59,130,246,.13), transparent 38%), #0f172a',
  color: '#e5e7eb',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const cardStyle: React.CSSProperties = {
  width: 'min(520px, 100%)',
  padding: 24,
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,.2)',
  background: 'rgba(15,23,42,.94)',
  boxShadow: '0 24px 70px rgba(0,0,0,.28)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,.28)',
  background: '#111827',
  color: '#f8fafc',
  outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  minHeight: 42,
  padding: '0 14px',
  border: 0,
  borderRadius: 10,
  background: '#2563eb',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'rgba(148,163,184,.14)',
  color: '#e5e7eb',
  border: '1px solid rgba(148,163,184,.18)',
};

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 10,
        background: 'rgba(220,38,38,.12)',
        color: '#fecaca',
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

function LoginCard({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);

    try {
      await requestOtp(phone);
      setStep('code');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось отправить код',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setBusy(true);
    setError(null);

    try {
      await verifyOtp(phone, code);
      onAuthenticated();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось подтвердить код',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 800 }}>
          Work time departments
        </div>
        <h1 style={{ margin: '8px 0 6px', fontSize: 26 }}>
          Вход для сотрудников
        </h1>
        <p style={{ margin: '0 0 20px', color: '#94a3b8', lineHeight: 1.5 }}>
          Введите номер телефона в международном формате. После подтверждения
          система проверит, связан ли аккаунт с профилем сотрудника.
        </p>

        <label style={{ display: 'grid', gap: 7, fontSize: 13 }}>
          Номер телефона
          <input
            style={inputStyle}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+7 999 123-45-67"
            autoComplete="tel"
            disabled={busy || step === 'code'}
          />
        </label>

        {step === 'code' && (
          <label
            style={{
              display: 'grid',
              gap: 7,
              marginTop: 14,
              fontSize: 13,
            }}
          >
            Код подтверждения
            <input
              style={inputStyle}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              autoFocus
            />
          </label>
        )}

        <ErrorText message={error} />

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          {step === 'phone' ? (
            <button
              type="button"
              style={{ ...buttonStyle, width: '100%' }}
              onClick={sendCode}
              disabled={busy || phone.trim().length < 8}
            >
              <LogIn size={17} />
              {busy ? 'Отправляю…' : 'Получить код'}
            </button>
          ) : (
            <>
              <button
                type="button"
                style={{ ...secondaryButtonStyle, flex: 1 }}
                onClick={() => {
                  setStep('phone');
                  setCode('');
                  setError(null);
                }}
                disabled={busy}
              >
                Изменить номер
              </button>
              <button
                type="button"
                style={{ ...buttonStyle, flex: 1 }}
                onClick={confirmCode}
                disabled={busy || code.length !== 6}
              >
                <CheckCircle2 size={17} />
                {busy ? 'Проверяю…' : 'Войти'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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

function OnboardingCard({
  user,
  onSessionChanged,
}: {
  user: AuthUser;
  onSessionChanged: () => void;
}) {
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

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [state, setState] = useState<'loading' | 'guest' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState('loading');
    setError(null);

    try {
      const nextUser = await getMe();
      setUser(nextUser);
      setState('ready');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setUser(null);
        setState('guest');
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Backend недоступен',
      );
      setState('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (state === 'loading') {
    return (
      <div style={pageStyle}>
        <div style={{ color: '#94a3b8' }}>Проверяем сессию…</div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0 }}>Backend недоступен</h1>
          <p style={{ color: '#94a3b8' }}>{error}</p>
          <button type="button" style={buttonStyle} onClick={refresh}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (state === 'guest' || !user) {
    return <LoginCard onAuthenticated={refresh} />;
  }

  if (!user.employee) {
    return <OnboardingCard user={user} onSessionChanged={refresh} />;
  }

  return <>{children}</>;
}
