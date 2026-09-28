import { useEffect, useState } from 'react';
import { KeyRound, Link2, ShieldCheck } from 'lucide-react';

import {
  ActivationInvitationInfo,
  getPasskeyAuthenticationOptions,
  getPasskeyRegistrationOptions,
  resolveActivationInvitation,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from '../../api/auth';
import { useAuthSession } from '../../auth/AuthSessionProvider';
import {
  authenticateWithPasskey,
  createPasskey,
} from '../../auth/passkeyBrowser';
import {
  AuthCard,
  AuthInput,
  AuthPage,
  ErrorText,
} from '../../theme/authPageUi';
import {
  LoginActions,
  LoginDescription,
  LoginEyebrow,
  LoginFieldLabel,
  LoginFlexSecondaryButton,
  LoginFullWidthButton,
  LoginTitle,
} from './LoginScreen.styles';

function initialActivationSecret(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('activation') ?? '';
}

export function LoginScreen() {
  const { refresh } = useAuthSession();
  const [activationSecret, setActivationSecret] = useState(
    initialActivationSecret,
  );
  const [invitation, setInvitation] =
    useState<ActivationInvitationInfo | null>(null);
  const [showActivation, setShowActivation] = useState(
    initialActivationSecret().length > 0,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveInvitation = async (secret: string) => {
    const normalized = secret.trim();
    if (!normalized) return;

    setBusy(true);
    setError(null);
    try {
      const next = await resolveActivationInvitation(normalized);
      setInvitation(next);
      setShowActivation(true);
    } catch (requestError) {
      setInvitation(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось проверить приглашение',
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const secret = initialActivationSecret();
    if (secret) {
      window.history.replaceState({}, '', '/login');
      void resolveInvitation(secret);
    }
    // The activation URL is read once and immediately removed from browser history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async () => {
    setBusy(true);
    setError(null);

    try {
      const options = await getPasskeyAuthenticationOptions();
      const credential = await authenticateWithPasskey(options);
      await verifyPasskeyAuthentication(credential);
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось войти с Passkey',
      );
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    const secret = activationSecret.trim();
    if (!secret || !invitation) return;

    setBusy(true);
    setError(null);

    try {
      const options = await getPasskeyRegistrationOptions(secret);
      const credential = await createPasskey(options);
      await verifyPasskeyRegistration(secret, credential);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/login');
      }
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось создать Passkey',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPage>
      <AuthCard>
        <LoginEyebrow>Work time departments</LoginEyebrow>
        <LoginTitle>
          {showActivation ? 'Активация аккаунта' : 'Вход для сотрудников'}
        </LoginTitle>

        {!showActivation ? (
          <>
            <LoginDescription>
              Входите через Face ID, отпечаток, Windows Hello или PIN устройства.
              Номер телефона и SMS для обычного входа не нужны.
            </LoginDescription>

            <ErrorText message={error} />

            <LoginActions>
              <LoginFullWidthButton
                type="button"
                onClick={() => void signIn()}
                disabled={busy}
              >
                <KeyRound size={17} />
                {busy ? 'Проверяю…' : 'Войти с Passkey'}
              </LoginFullWidthButton>

              <LoginFlexSecondaryButton
                type="button"
                onClick={() => {
                  setShowActivation(true);
                  setError(null);
                }}
                disabled={busy}
              >
                <Link2 size={16} />
                Активировать аккаунт
              </LoginFlexSecondaryButton>
            </LoginActions>
          </>
        ) : invitation ? (
          <>
            <LoginDescription>
              <ShieldCheck size={17} aria-hidden="true" />{' '}
              {invitation.employee.displayName} ·{' '}
              {invitation.employee.departmentName}. Создайте Passkey — после
              этого приглашение станет недействительным.
            </LoginDescription>

            <ErrorText message={error} />

            <LoginActions>
              <LoginFullWidthButton
                type="button"
                onClick={() => void activate()}
                disabled={busy}
              >
                <KeyRound size={17} />
                {busy ? 'Создаю…' : 'Создать Passkey и войти'}
              </LoginFullWidthButton>

              <LoginFlexSecondaryButton
                type="button"
                onClick={() => {
                  setInvitation(null);
                  setActivationSecret('');
                  setShowActivation(false);
                  setError(null);
                }}
                disabled={busy}
              >
                Назад ко входу
              </LoginFlexSecondaryButton>
            </LoginActions>
          </>
        ) : (
          <>
            <LoginDescription>
              Отсканируйте приглашение от руководителя или введите резервный
              одноразовый код.
            </LoginDescription>

            <LoginFieldLabel>
              Код активации
              <AuthInput
                value={activationSecret}
                onChange={event => setActivationSecret(event.target.value)}
                placeholder="ABCDE-FGHIJ"
                autoComplete="one-time-code"
                disabled={busy}
              />
            </LoginFieldLabel>

            <ErrorText message={error} />

            <LoginActions>
              <LoginFullWidthButton
                type="button"
                onClick={() => void resolveInvitation(activationSecret)}
                disabled={busy || activationSecret.trim().length < 6}
              >
                <ShieldCheck size={17} />
                {busy ? 'Проверяю…' : 'Продолжить'}
              </LoginFullWidthButton>

              <LoginFlexSecondaryButton
                type="button"
                onClick={() => {
                  setShowActivation(false);
                  setActivationSecret('');
                  setError(null);
                }}
                disabled={busy}
              >
                Назад ко входу
              </LoginFlexSecondaryButton>
            </LoginActions>
          </>
        )}
      </AuthCard>
    </AuthPage>
  );
}
