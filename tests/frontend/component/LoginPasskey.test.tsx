import { ThemeProvider } from '@emotion/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  resolveActivationInvitation: vi.fn(),
  getPasskeyAuthenticationOptions: vi.fn(),
  getPasskeyRegistrationOptions: vi.fn(),
  verifyPasskeyAuthentication: vi.fn(),
  verifyPasskeyRegistration: vi.fn(),
  authenticateWithPasskey: vi.fn(),
  createPasskey: vi.fn(),
}));

vi.mock('../../../src/auth/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    refresh: mocks.refresh,
    signOut: vi.fn(),
    status: 'guest',
    user: null,
    error: null,
  }),
}));

vi.mock('../../../src/api/auth', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/api/auth')>();
  return {
    ...original,
    resolveActivationInvitation: mocks.resolveActivationInvitation,
    getPasskeyAuthenticationOptions: mocks.getPasskeyAuthenticationOptions,
    getPasskeyRegistrationOptions: mocks.getPasskeyRegistrationOptions,
    verifyPasskeyAuthentication: mocks.verifyPasskeyAuthentication,
    verifyPasskeyRegistration: mocks.verifyPasskeyRegistration,
  };
});

vi.mock('../../../src/auth/passkeyBrowser', () => ({
  authenticateWithPasskey: mocks.authenticateWithPasskey,
  createPasskey: mocks.createPasskey,
}));

import { LoginScreen } from '../../../src/screens/auth/LoginScreen';
import { getTheme } from '../../../src/theme/theme';

function renderScreen() {
  render(
    <ThemeProvider theme={getTheme('light')}>
      <LoginScreen />
    </ThemeProvider>,
  );
}

describe('LoginScreen passkey flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/login');
  });

  it('uses Passkey as the primary login and does not require a phone number', async () => {
    const user = userEvent.setup();
    mocks.getPasskeyAuthenticationOptions.mockResolvedValue({
      challenge: 'challenge',
      rpId: 'localhost',
      timeout: 60_000,
      userVerification: 'required',
    });
    mocks.authenticateWithPasskey.mockResolvedValue({
      id: 'credential',
      rawId: 'credential',
      type: 'public-key',
      response: {},
    });
    mocks.verifyPasskeyAuthentication.mockResolvedValue({
      expiresAt: '2026-12-28T00:00:00.000Z',
      userId: 'user-1',
    });

    renderScreen();

    expect(screen.queryByLabelText(/Номер телефона/i)).not.toBeInTheDocument();
    expect(screen.getByText(/SMS для обычного входа не нужны/)).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Войти с Passkey' }),
    );

    expect(mocks.getPasskeyAuthenticationOptions).toHaveBeenCalledOnce();
    expect(mocks.authenticateWithPasskey).toHaveBeenCalledOnce();
    expect(mocks.verifyPasskeyAuthentication).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('resolves fallback activation code, creates a Passkey and establishes the session', async () => {
    const user = userEvent.setup();
    mocks.resolveActivationInvitation.mockResolvedValue({
      invitationId: 'invitation-1',
      purpose: 'ACTIVATION',
      expiresAt: '2026-09-28T18:00:00.000Z',
      employee: {
        id: 'employee-1',
        displayName: 'Иванов И.И.',
        departmentId: 'department-a',
        departmentName: 'Front Office',
      },
    });
    mocks.getPasskeyRegistrationOptions.mockResolvedValue({
      challenge: 'registration-challenge',
      rp: { id: 'localhost', name: 'Work Time Departments' },
      user: {
        id: 'user-handle',
        name: 'wtd-user',
        displayName: 'wtd-user',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60_000,
      attestation: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      excludeCredentials: [],
    });
    mocks.createPasskey.mockResolvedValue({
      id: 'credential',
      rawId: 'credential',
      type: 'public-key',
      response: {},
    });
    mocks.verifyPasskeyRegistration.mockResolvedValue({
      expiresAt: '2026-12-28T00:00:00.000Z',
      user: {
        id: 'user-1',
        phoneE164: null,
        onboardingRequired: false,
      },
    });

    renderScreen();

    await user.click(
      screen.getByRole('button', { name: 'Активировать аккаунт' }),
    );
    await user.type(screen.getByLabelText('Код активации'), 'ABCDE-FGHIJ');
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(mocks.resolveActivationInvitation).toHaveBeenCalledWith(
      'ABCDE-FGHIJ',
    );
    expect(
      await screen.findByText(/Иванов И.И. · Front Office/),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: 'Создать Passkey и войти',
      }),
    );

    expect(mocks.getPasskeyRegistrationOptions).toHaveBeenCalledWith(
      'ABCDE-FGHIJ',
    );
    expect(mocks.createPasskey).toHaveBeenCalledOnce();
    expect(mocks.verifyPasskeyRegistration).toHaveBeenCalledWith(
      'ABCDE-FGHIJ',
      expect.any(Object),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
