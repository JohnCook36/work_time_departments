import React, { useState } from 'react';
import { CheckCircle2, LogIn } from 'lucide-react';
import { requestOtp, verifyOtp } from '../../api/auth';
import { useAuthSession } from '../../auth/AuthSessionProvider';
import { authPalette } from '../../theme/palette';
import { pageStyle, cardStyle, inputStyle, buttonStyle, secondaryButtonStyle, ErrorText } from '../../theme/authPageUi';

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
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 13, color: authPalette.buttonBackground, fontWeight: 800 }}>
          Work time departments
        </div>
        <h1 style={{ margin: '8px 0 6px', fontSize: 26 }}>
          Вход для сотрудников
        </h1>
        <p style={{ margin: '0 0 20px', color: authPalette.textMuted, lineHeight: 1.5 }}>
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
