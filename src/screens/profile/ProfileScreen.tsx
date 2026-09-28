import { useEffect, useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';

import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import {
  getPasskeys,
  PasskeyCredentialSummary,
  revokePasskey,
} from '../../api/auth';
import { useAppDialog } from '../../components/dialogs/AppDialogProvider';
import { ActionButton } from '../../theme/styles';
import { useAuthUser } from '../../auth/AuthContext';
import {
  DataLabel,
  DataRow,
  DataValue,
  SectionCard,
  SectionContainer,
  SectionGrid,
  SectionHeader,
  SectionPage,
  SectionSubtitle,
  SectionTitle,
} from '../shared/SectionPage.styles';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Суперадминистратор',
  DEPARTMENT_ADMIN: 'Администратор отдела',
  DEPUTY: 'Заместитель',
  EMPLOYEE: 'Сотрудник',
};

export function ProfileScreen() {
  const user = useAuthUser();
  const { confirmAction, showMessage } = useAppDialog();
  const [passkeys, setPasskeys] = useState<PasskeyCredentialSummary[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [busyCredentialId, setBusyCredentialId] = useState<string | null>(null);

  const loadPasskeys = async () => {
    setPasskeysLoading(true);
    try {
      setPasskeys(await getPasskeys());
    } catch {
      setPasskeys([]);
    } finally {
      setPasskeysLoading(false);
    }
  };

  useEffect(() => {
    void loadPasskeys();
  }, []);

  const removePasskey = async (credentialId: string) => {
    const confirmed = await confirmAction(
      'Удалить этот Passkey? На устройстве он может остаться сохранённым, но сервер больше не примет его для входа.',
      {
        title: 'Удаление Passkey',
        confirmLabel: 'Удалить Passkey',
      },
    );
    if (!confirmed) return;

    setBusyCredentialId(credentialId);
    try {
      await revokePasskey(credentialId);
      await loadPasskeys();
    } catch (requestError) {
      void showMessage(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось удалить Passkey.',
        { title: 'Passkey не удалён' },
      );
    } finally {
      setBusyCredentialId(null);
    }
  };
  const employee = user.employee;

  const roles = user.memberships
    .map((membership) => ROLE_LABELS[membership.role] || membership.role)
    .join(', ');

  const scheduleLabel =
    employee?.scheduleMode === 'FIXED_WEEKDAYS' &&
    employee.fixedStartTime &&
    employee.fixedEndTime
      ? '5/2 · ' + employee.fixedStartTime + '–' + employee.fixedEndTime
      : 'Плавающий график';

  return (
    <SectionPage>
      <SectionContainer>
        <SectionHeader>
          <SectionTitle>Профиль</SectionTitle>
          <SectionSubtitle>
            Данные текущего авторизованного аккаунта и связанного сотрудника.
          </SectionSubtitle>
          <AppSectionNav />
        </SectionHeader>

        <SectionCard>
          <SectionGrid>
            <DataRow>
              <DataLabel>Сотрудник</DataLabel>
              <DataValue>{employee?.displayName || 'Профиль сотрудника не связан'}</DataValue>
            </DataRow>

            <DataRow>
              <DataLabel>Телефон</DataLabel>
              <DataValue>{user.phoneE164 || 'Не используется для входа'}</DataValue>
            </DataRow>

            <DataRow>
              <DataLabel>Роль</DataLabel>
              <DataValue>{roles || 'Не назначена'}</DataValue>
            </DataRow>

            {employee && (
              <>
                <DataRow>
                  <DataLabel>Ставка</DataLabel>
                  <DataValue>{employee.employmentRate}</DataValue>
                </DataRow>

                <DataRow>
                  <DataLabel>Режим графика</DataLabel>
                  <DataValue>{scheduleLabel}</DataValue>
                </DataRow>

                <DataRow>
                  <DataLabel>Отдел</DataLabel>
                  <DataValue>{employee.departmentName || 'Не указан'}</DataValue>
                </DataRow>
              </>
            )}
          </SectionGrid>
        </SectionCard>
        <SectionCard>
          <SectionGrid>
            <DataRow>
              <DataLabel>Passkey</DataLabel>
              <DataValue>
                <KeyRound size={16} aria-hidden="true" />{' '}
                {passkeysLoading
                  ? 'Загрузка…'
                  : passkeys.length === 0
                    ? 'Нет активных Passkey'
                    : 'Активных: ' + passkeys.length}
              </DataValue>
            </DataRow>

            {!passkeysLoading &&
              passkeys.map((credential, index) => (
                <DataRow key={credential.id}>
                  <DataLabel>Ключ {index + 1}</DataLabel>
                  <DataValue>
                    {credential.lastUsedAt
                      ? 'Последний вход: ' +
                        new Date(credential.lastUsedAt).toLocaleDateString('ru-RU')
                      : 'Создан: ' +
                        new Date(credential.createdAt).toLocaleDateString('ru-RU')}
                    {passkeys.length > 1 && (
                      <ActionButton
                        type="button"
                        $variant="danger"
                        disabled={busyCredentialId === credential.id}
                        onClick={() => void removePasskey(credential.id)}
                      >
                        <Trash2 size={14} />
                        Удалить
                      </ActionButton>
                    )}
                  </DataValue>
                </DataRow>
              ))}

            {!passkeysLoading && passkeys.length === 1 && (
              <DataRow>
                <DataLabel>Восстановление</DataLabel>
                <DataValue>
                  Последний Passkey удаляется только через новый recovery-код
                  руководителя, чтобы не потерять доступ к аккаунту.
                </DataValue>
              </DataRow>
            )}
          </SectionGrid>
        </SectionCard>
      </SectionContainer>
    </SectionPage>
  );
}
