import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlannerScreen from '../../../src/screens/planner/PlannerScreen';
import MyScheduleScreen from '../../../src/screens/my-schedule/MyScheduleScreen';
import { useAuthUser } from '../../../src/auth/AuthContext';
import * as api from '../../../src/api/auth';
import { RoutedApplication } from '../../../src/router/RoutedApplication';

vi.mock('../../../src/screens/planner/PlannerScreen', () => ({ default: vi.fn() }));
vi.mock('../../../src/screens/my-schedule/MyScheduleScreen', () => ({ default: vi.fn() }));

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
    {
      id: 'manager-membership',
      role: 'DEPARTMENT_ADMIN',
      departmentId: 'example-department',
    },
  ],
};

function ExistingApplication() {
  const authenticatedUser = useAuthUser();
  return <div>Existing application: {authenticatedUser.id}</div>;
}

function ExistingSchedule() {
  const authenticatedUser = useAuthUser();
  return <div>Personal schedule: {authenticatedUser.id}</div>;
}

function open(path: string) {
  window.history.replaceState(null, '', path);
  return render(<RoutedApplication />);
}

describe('Routing foundation with real session provider and ErrorBoundary', () => {
  beforeEach(() => {
    vi.mocked(PlannerScreen).mockImplementation(ExistingApplication);
    vi.mocked(MyScheduleScreen).mockImplementation(ExistingSchedule);
    vi.spyOn(api, 'getMe').mockResolvedValue(user);
    vi.spyOn(api, 'getOnboardingDepartments').mockResolvedValue([]);
    vi.spyOn(api, 'getOnboardingStatus').mockResolvedValue(null);
  });
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('redirects linked EMPLOYEE from / to /my-schedule using replace', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    open('/');
    expect(await screen.findByText('Personal schedule: example-user')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/my-schedule'));
    expect(replace).toHaveBeenCalledWith(expect.anything(), '', '/my-schedule');
  });

  it('redirects linked EMPLOYEE away from /planner to /my-schedule', async () => {
    open('/planner');
    expect(await screen.findByText('Personal schedule: example-user')).toBeInTheDocument();
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
  });

  it('allows management users to open /planner', async () => {
    vi.mocked(api.getMe).mockResolvedValue(managerUser);
    open('/planner');
    expect(await screen.findByText('Existing application: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/planner');
  });

  it('allows management users to open /my-schedule', async () => {
    vi.mocked(api.getMe).mockResolvedValue(managerUser);
    open('/my-schedule');
    expect(await screen.findByText('Personal schedule: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
  });

  it('opens /profile for a linked employee', async () => {
    open('/profile');
    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeInTheDocument();
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/profile');
  });

  it('opens /tasks without inventing task data', async () => {
    open('/tasks');
    expect(await screen.findByRole('heading', { name: 'Задачи' })).toBeInTheDocument();
    expect(screen.getByText(/Backend-модель задач/)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/tasks');
  });

  it('shows 404 for an unknown route and links back to the application', async () => {
    open('/unknown');
    expect(await screen.findByRole('heading', { name: '404 — Страница не найдена' })).toBeInTheDocument();
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Вернуться в приложение' }));
    expect(await screen.findByText('Personal schedule: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
  });

  it.each(['/planner', '/my-schedule', '/tasks', '/profile', '/login', '/onboarding', '/unknown'])('routes guests to login from %s', async path => {
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError('Unauthorized', 401));
    open(path);
    expect(await screen.findByRole('heading', { name: 'Вход для сотрудников' })).toBeInTheDocument();
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it.each(['/planner', '/my-schedule', '/tasks', '/profile', '/onboarding', '/login'])('routes unlinked accounts to onboarding from %s', async path => {
    vi.mocked(api.getMe).mockResolvedValue({ ...user, employee: null });
    open(path);
    expect(await screen.findByText('Нет профиля в графике?')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/onboarding');
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
  });

  it.each(['/login', '/onboarding'])('redirects linked EMPLOYEE from %s to personal schedule', async path => {
    open(path);
    expect(await screen.findByText('Personal schedule: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
  });

  it.each(['/login', '/onboarding'])('redirects linked manager from %s to planner', async path => {
    vi.mocked(api.getMe).mockResolvedValue(managerUser);
    open(path);
    expect(await screen.findByText('Existing application: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/planner');
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
    expect(await screen.findByText(linked ? 'Personal schedule: example-user' : 'Нет профиля в графике?')).toBeInTheDocument();
    expect(window.location.pathname).toBe(linked ? '/my-schedule' : '/onboarding');
    expect(api.requestOtp).toHaveBeenCalledWith(user.phoneE164);
    expect(api.verifyOtp).toHaveBeenCalledWith(user.phoneE164, '123456');
    expect(api.getMe).toHaveBeenCalledTimes(2);
  });

  it('logs out from onboarding and routes to login', async () => {
    vi.mocked(api.getMe).mockResolvedValueOnce({ ...user, employee: null })
      .mockRejectedValue(new api.ApiError('Unauthorized', 401));
    vi.spyOn(api, 'logout').mockResolvedValue({ status: 'ok' });
    localStorage.setItem(
      'hotel-shift-planner:user:' + encodeURIComponent(user.id),
      JSON.stringify({ employees: [{ id: 'private-employee' }] }),
    );

    open('/onboarding');
    fireEvent.click(await screen.findByRole('button', { name: 'Выйти' }));

    expect(
      await screen.findByRole('heading', { name: 'Вход для сотрудников' }),
    ).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledOnce();
    expect(
      localStorage.getItem(
        'hotel-shift-planner:user:' + encodeURIComponent(user.id),
      ),
    ).toBeNull();
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
    expect(await screen.findByText('Personal schedule: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
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
    open('/my-schedule');
    expect(screen.getByText('Проверяем сессию…')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
    await act(async () => { resolveSession(user); });
    expect(await screen.findByText('Personal schedule: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
  });

  it('preserves the session error and retry without redirecting to login', async () => {
    vi.mocked(api.getMe).mockRejectedValueOnce(new Error('Соединение недоступно'));
    open('/my-schedule');
    expect(await screen.findByRole('heading', { name: 'Backend недоступен' })).toBeInTheDocument();
    expect(screen.getByText('Соединение недоступно')).toBeInTheDocument();
    expect(screen.queryByText('Personal schedule: example-user')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-schedule');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Personal schedule: example-user')).toBeInTheDocument();
  });

  it('catches a routed application render crash with the root boundary', async () => {
    const error = new Error('routing-test-error');
    const suppressExpectedError = (event: ErrorEvent) => {
      if (event.error === error) event.preventDefault();
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.getMe).mockResolvedValue(managerUser);
    vi.mocked(PlannerScreen).mockImplementation(() => { throw error; });
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
