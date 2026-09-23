import React, { useCallback, useEffect, useState } from 'react';
import { Clock3, LogOut, Search, UserPlus } from 'lucide-react';
import { EmployeeCandidate, OnboardingDepartment, OnboardingRequest,
  cancelOnboardingRequest, getOnboardingDepartments, getOnboardingStatus,
  requestExistingEmployeeLink, requestNewEmployeeRegistration, searchEmployeeCandidates,
} from '../../api/auth';
import { useAuthUser } from '../../auth/AuthContext';
import { useAuthSession } from '../../auth/AuthSessionProvider';
import {
  AuthButton,
  AuthCard,
  AuthInput,
  AuthPage,
  AuthSecondaryButton,
  AuthSelect,
  ErrorText,
} from '../../theme/authPageUi';
import {
  AccountText,
  CandidateButton,
  CandidateList,
  FullWidthAuthButton,
  LogoutButton,
  NewProfileDescription,
  NewProfileSection,
  NewProfileTitle,
  OnboardingButtonRow,
  OnboardingDescription,
  OnboardingField,
  OnboardingIntro,
  OnboardingTitle,
  PendingDescription,
  PendingHeader,
  PendingPanel,
  SearchRow,
} from './OnboardingScreen.styles';

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
    <PendingPanel>
      <PendingHeader>
        <Clock3 size={17} />
        Запрос ожидает подтверждения администратора
      </PendingHeader>
      <PendingDescription>
        До подтверждения профиль сотрудника не привязывается к аккаунту.
      </PendingDescription>
      <OnboardingButtonRow>
        <AuthSecondaryButton type="button" onClick={onRefresh}>
          Проверить статус
        </AuthSecondaryButton>
        <AuthSecondaryButton
          type="button"
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
        </AuthSecondaryButton>
      </OnboardingButtonRow>
    </PendingPanel>
  );
}

export function OnboardingScreen() {
  const user = useAuthUser();
  const { refresh: onSessionChanged, signOut } = useAuthSession();
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
      <AuthPage>
        <AuthCard>
          <OnboardingTitle>Привязка профиля</OnboardingTitle>
          <OnboardingIntro>
            Телефон подтверждён. Осталось подтвердить профиль сотрудника.
          </OnboardingIntro>
          <PendingRequest
            request={status}
            onCanceled={() => {
              setStatus(null);
              void load();
            }}
            onRefresh={onSessionChanged}
          />
          <LogoutButton
            type="button"
            onClick={() => void signOut()}
          >
            <LogOut size={16} />
            Выйти
          </LogoutButton>
        </AuthCard>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <AuthCard>
        <OnboardingTitle>Найдите свой профиль</OnboardingTitle>
        <OnboardingDescription>
          Для защиты от чужой привязки выбор профиля создаёт запрос. Сам профиль
          будет связан с аккаунтом только после подтверждения администратора.
        </OnboardingDescription>

        <OnboardingField>
          Отдел
          <AuthSelect
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
          </AuthSelect>
        </OnboardingField>

        <SearchRow>
          <AuthInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Начните вводить имя"
          />
          <AuthButton
            type="button"
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
          </AuthButton>
        </SearchRow>

        {candidates.length > 0 && (
          <CandidateList>
            {candidates.map((candidate) => (
              <CandidateButton
                key={candidate.id}
                type="button"
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
              </CandidateButton>
            ))}
          </CandidateList>
        )}

        <NewProfileSection>
          <NewProfileTitle>Нет профиля в графике?</NewProfileTitle>
          <NewProfileDescription>
            Отправьте администратору запрос на создание нового профиля в
            выбранном отделе.
          </NewProfileDescription>
          <AuthInput
            value={registrationName}
            onChange={(event) => setRegistrationName(event.target.value)}
            placeholder="Имя и фамилия"
          />
          <FullWidthAuthButton
            type="button"
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
          </FullWidthAuthButton>
        </NewProfileSection>

        <ErrorText message={error} />

        <LogoutButton
          type="button"
          onClick={() => void signOut()}
        >
          <LogOut size={16} />
          Выйти
        </LogoutButton>

        <AccountText>Аккаунт: {user.phoneE164}</AccountText>
      </AuthCard>
    </AuthPage>
  );
}
