import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlannerScreen from '../../../src/screens/planner/PlannerScreen';
import { MyScheduleScreen } from '../../../src/screens/my-schedule/MyScheduleScreen';
import { useAuthUser } from '../../../src/auth/AuthContext';
import * as api from '../../../src/api/auth';
import { RoutedApplication } from '../../../src/router/RoutedApplication';

vi.mock('../../../src/screens/planner/PlannerScreen', () => ({ default: vi.fn() }));
vi.mock('../../../src/screens/my-schedule/MyScheduleScreen', () => ({ MyScheduleScreen: vi.fn() }));

const user: api.AuthUser = {
  id: 'example-user', phoneE164: '+12025550100',
  employee: {
    id: 'example-employee', displayName: 'Example', departmentId: 'example-department',
    employmentRate: 1, scheduleMode: 'FLEXIBLE', fixedStartTime: null, fixedEndTime: null,
  },
  memberships: [{ id: 'example-membership', role: 'EMPLOYEE', departmentId: 'example-department' }],
};

const managerUser: api.AuthUser = {
  ...user,
  memberships: [
    { id: 'manager-membership', role: 'DEPARTMENT_ADMIN', departmentId: 'example-department' },
  ],
};

function ExistingApplication() {
  const authenticatedUser = useAuthUser();
  return <div>Existing application: {authenticatedUser.id}</div>;
}

function open(path: string) {
  window.history.replaceState(null, '', path);
  return render(<RoutedApplication />);
}

describe('Routing foundation with real session provider and ErrorBoundary', () => {
  beforeEach(() => {
    vi.mocked(PlannerScreen).mockImplementation(ExistingApplication);
    vi.mocked(MyScheduleScreen).mockImplementation(() => <div>Personal schedule</div>);
    vi.spyOn(api, 'getMe').mockResolvedValue(user);
    vi.spyOn(api, 'getOnboardingDepartments').mockResolvedValue([]);
    vi.spyOn(api, 'getOnboardingStatus').mockResolvedValue(null);
  });
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('redirects linked EMPLOYEE from / to /my-schedule using replace', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    open('/');
    expect(await screen.findByText('Personal schedule')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/my-schedule'));
    expect(replace).toHaveBeenCalledWith(expect.anything(), '', '/my-schedule');
  });

  it('redirects management user from / to /planner', async () => {
    vi.mocked(api.getMe).mockResolvedValue(managerUser);
    open('/');
    expect(await screen.findByText('Personal schedule')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
  });

  it('redirects linked EMPLOYEE away from /planner to /my-schedule', async () => {
    open('/planner');
    expect(await screen.findByText('Personal schedule')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
  });

  it('allows management user to open /planner', async () => {
    vi.mocked(api.getMe).mockResolvedValue(managerUser);
    open('/planner');
    expect(await screen.findByText('Personal schedule')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
  });

  it('opens /my-schedule for any linked employee', async () => {
    open('/my-schedule');
    expect(await screen.findByText('Personal schedule')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
  });

  it('shows 404 for an unknown route and links back to the application', async () => {
    open('/unknown');
    expect(await screen.findByRole('heading', { name: '404 — Страница не найдена' })).toBeInTheDocument();
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Вернуться в приложение' }));
    expect(await screen.findByText('Existing application: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/planner');
  });

  it.each(['/planner', '/my-schedule', '/login', '/onboarding', '/unknown'])('routes guests to login from %s', async path => {
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError('Unauthorized', 401));
    open(path);
    expect(await screen.findByRole('heading', { name: 'Вход для сотрудников' })).toBeInTheDocument();
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it.each(['/planner', '/my-schedule', '/onboarding', '/login'])('routes unlinked accounts to onboarding from %s', async path => {
    vi.mocked(api.getMe).mockResolvedValue({ ...user, employee: null });
    open(path);
    expect(await screen.findByText('Нет профиля в графике?')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/onboarding');
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
  });

  it.each(['/login', '/onboarding'])('redirects linked EMPLOYEE from %s to personal schedule', async path => {
    open(path);
    expect(await screen.findByText('Personal schedule')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
  });

  it.each([true, false])('refreshes canonical session after OTP login (linked=%s)', async linked => {
    vi.mocked(api.getMe).mockRejectedValueOnce(new api.ApiError('Unauthorized', 401))
      .mockResolvedValue({ ...user, employee: linked ? user.employee : null });
    vi.spyOn(api, 'requestOtp').mockResolvedValue({ status: 'sent', expiresInSeconds: 300 });
    vi.spyOn(api, 'verifyOtp').mockResolvedValue({ expiresAt: '2030-01-01', user: {
      id: user.id, phoneE164: user.phoneE164, onboardingRequired: !linked,
    } });
    open('/login');
    fireEvent.change(await screen.findByLabelText('Номер телефона'), { target: { value: user.phoneE164 } });
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    fireEvent.change(await screen.findByLabelText('Код подтверждения'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText(linked ? 'Personal schedule' : 'Нет профиля в графике?')).toBeInTheDocument();
    expect(window.location.pathname).toBe(linked ? '/my-schedule' : '/onboarding');
    expect(api.requestOtp).toHaveBeenCalledWith(user.phoneE164);
    expect(api.verifyOtp).toHaveBeenCalledWith(user.phoneE164, '123456');
    expect(api.getMe).toHaveBeenCalledTimes(2);
  });

  it('logs out from onboarding and routes to login', async () => {
    vi.mocked(api.getMe).mockResolvedValueOnce({ ...user, employee: null })
      .mockRejectedValue(new api.ApiError('Unauthorized', 401));
    vi.spyOn(api, 'logout').mockResolvedValue({ status: 'ok' });
    open('/onboarding');
    fireEvent.click(await screen.findByRole('button', { name: 'Выйти' }));
    expect(await screen.findByRole('heading', { name: 'Вход для сотрудников' })).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/login');
  });

  const pending: api.OnboardingRequest = {
    id: 'request', type: 'LINK_EXISTING', status: 'PENDING', departmentId: 'department',
    employeeId: 'employee', requestedDisplayName: null, reviewedAt: null,
    createdAt: '2026-09-22', updatedAt: '2026-09-22',
  };

  it('preserves pending approval and refreshes session after approval', async () => {
    vi.mocked(api.getMe).mockResolvedValueOnce({ ...user, employee: null });
    vi.mocked(api.getOnboardingStatus).mockResolvedValue(pending);
    open('/onboarding');
    expect(await screen.findByText('Запрос ожидает подтверждения администратора')).toBeInTheDocument();
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить статус' }));
    expect(await screen.findByText('Existing application: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/planner');
  });

  it('cancels a pending request and returns to profile selection', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ ...user, employee: null });
    vi.mocked(api.getOnboardingStatus).mockResolvedValueOnce(pending);
    vi.spyOn(api, 'cancelOnboardingRequest').mockResolvedValue({ ...pending, status: 'CANCELED' });
    open('/onboarding');
    fireEvent.click(await screen.findByRole('button', { name: 'Отменить запрос' }));
    expect(await screen.findByText('Нет профиля в графике?')).toBeInTheDocument();
    expect(api.cancelOnboardingRequest).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/onboarding');
  });

  it('keeps URL and loading UI until the session resolves without redirect flicker', async () => {
    let resolveSession!: (value: api.AuthUser) => void;
    vi.mocked(api.getMe).mockReturnValue(new Promise(resolve => { resolveSession = resolve; }));
    open('/planner');
    expect(screen.getByText('Проверяем сессию…')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/planner');
    await act(async () => { resolveSession(user); });
    expect(await screen.findByText('Existing application: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/planner');
  });

  it('preserves the session error and retry without redirecting to login', async () => {
    vi.mocked(api.getMe).mockRejectedValueOnce(new Error('Соединение недоступно'));
    open('/planner');
    expect(await screen.findByRole('heading', { name: 'Backend недоступен' })).toBeInTheDocument();
    expect(screen.getByText('Соединение недоступно')).toBeInTheDocument();
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/planner');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Personal schedule')).toBeInTheDocument();
  });

  it('catches a routed application render crash with the root boundary', async () => {
    const error = new Error('routing-test-error');
    const suppressExpectedError = (event: ErrorEvent) => {
      if (event.error === error) event.preventDefault();
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(PlannerScreen).mockImplementation(() => { throw error; });
    vi.mocked(api.getMe).mockResolvedValue(managerUser);
    window.addEventListener('error', suppressExpectedError);
    try {
      open('/planner');
      expect(await screen.findByRole('heading', { name: 'Что-то пошло не так' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Перезагрузить' })).toBeInTheDocument();
    } finally {
      window.removeEventListener('error', suppressExpectedError);
    }
  });
});
