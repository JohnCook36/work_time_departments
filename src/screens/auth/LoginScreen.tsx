import React, { useState } from 'react';
import { CheckCircle2, LogIn } from 'lucide-react';
import { requestOtp, verifyOtp } from '../../api/auth';
import { useAuthSession } from '../../auth/AuthSessionProvider';
import { AuthCard, AuthInput, AuthPage, ErrorText } from '../../theme/authPageUi';
import {
  LoginActions,
  LoginDescription,
  LoginEyebrow,
  LoginFieldLabel,
  LoginFlexButton,
  LoginFlexSecondaryButton,
  LoginFullWidthButton,
  LoginTitle,
} from './LoginScreen.styles';

export function LoginScreen() {
  const { refresh: onAuthenticated } = useAuthSession();
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
    <AuthPage>
      <AuthCard>
        <LoginEyebrow>Work time departments</LoginEyebrow>
        <LoginTitle>Вход для сотрудников</LoginTitle>
        <LoginDescription>
          Введите номер телефона в международном формате. После подтверждения
          система проверит, связан ли аккаунт с профилем сотрудника.
        </LoginDescription>

        <LoginFieldLabel>
          Номер телефона
          <AuthInput
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+7 999 123-45-67"
            autoComplete="tel"
            disabled={busy || step === 'code'}
          />
        </LoginFieldLabel>

        {step === 'code' && (
          <LoginFieldLabel $spaced>
            Код подтверждения
            <AuthInput
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
        </LoginFieldLabel>
        )}

        <ErrorText message={error} />

        <LoginActions>
          {step === 'phone' ? (
            <LoginFullWidthButton
              type="button"
              onClick={sendCode}
              disabled={busy || phone.trim().length < 8}
            >
              <LogIn size={17} />
              {busy ? 'Отправляю…' : 'Получить код'}
            </LoginFullWidthButton>
          ) : (
            <>
              <LoginFlexSecondaryButton
                type="button"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                  setError(null);
                }}
                disabled={busy}
              >
                Изменить номер
              </LoginFlexSecondaryButton>
              <LoginFlexButton
                type="button"
                onClick={confirmCode}
                disabled={busy || code.length !== 6}
              >
                <CheckCircle2 size={17} />
                {busy ? 'Проверяю…' : 'Войти'}
              </LoginFlexButton>
            </>
          )}
        </LoginActions>
      </AuthCard>
    </AuthPage>
  );
}
