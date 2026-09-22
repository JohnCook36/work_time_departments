import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { useAuthUser } from '../auth/AuthContext';
import * as api from '../auth/api';
import { RoutedApplication } from './RoutedApplication';

vi.mock('../App', () => ({ default: vi.fn() }));

const user: api.AuthUser = {
  id: 'example-user', phoneE164: '+12025550100',
  employee: {
    id: 'example-employee', displayName: 'Example', departmentId: 'example-department',
    employmentRate: 1, scheduleMode: 'FLEXIBLE', fixedStartTime: null, fixedEndTime: null,
  },
  memberships: [{ id: 'example-membership', role: 'EMPLOYEE', departmentId: 'example-department' }],
};

function ExistingApplication() {
  const authenticatedUser = useAuthUser();
  return <div>Existing application: {authenticatedUser.id}</div>;
}

function open(path: string) {
  window.history.replaceState(null, '', path);
  return render(<RoutedApplication />);
}

describe('Routing foundation with real root AuthGate and ErrorBoundary', () => {
  beforeEach(() => {
    vi.mocked(App).mockImplementation(ExistingApplication);
    vi.spyOn(api, 'getMe').mockResolvedValue(user);
  });
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('redirects / to /planner using replace and renders the existing application', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    open('/');
    expect(await screen.findByText('Existing application: example-user')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/planner'));
    expect(replace).toHaveBeenCalledWith(expect.anything(), '', '/planner');
  });

  it('opens /planner through the existing session context without changing its URL', async () => {
    open('/planner');
    expect(await screen.findByText('Existing application: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/planner');
  });

  it('shows 404 for an unknown route and links back to the application', async () => {
    open('/unknown');
    expect(await screen.findByRole('heading', { name: '404 — Страница не найдена' })).toBeInTheDocument();
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Вернуться в приложение' }));
    expect(await screen.findByText('Existing application: example-user')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/planner');
  });

  it.each(['/planner', '/unknown'])('keeps guests behind AuthGate at %s', async path => {
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError('Unauthorized', 401));
    open(path);
    expect(await screen.findByRole('heading', { name: 'Вход для сотрудников' })).toBeInTheDocument();
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
  });

  it('keeps unlinked accounts in the existing onboarding flow', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ ...user, employee: null });
    vi.spyOn(api, 'getOnboardingDepartments').mockResolvedValue([]);
    vi.spyOn(api, 'getOnboardingStatus').mockResolvedValue(null);
    open('/planner');
    expect(await screen.findByText('Нет профиля в графике?')).toBeInTheDocument();
    expect(screen.queryByText('Existing application: example-user')).not.toBeInTheDocument();
  });

  it('catches a routed application render crash with the root boundary', async () => {
    const error = new Error('routing-test-error');
    const suppressExpectedError = (event: ErrorEvent) => {
      if (event.error === error) event.preventDefault();
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(App).mockImplementation(() => { throw error; });
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
