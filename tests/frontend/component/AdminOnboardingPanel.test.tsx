import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminOnboardingPanel } from '../../../src/screens/onboarding/AdminOnboardingPanel';
import { AppThemeProvider } from '../../../src/theme/AppThemeProvider';
import {
  getAdminOnboardingDepartments,
  getAdminPendingOnboardingRequests,
} from '../../../src/api/auth';

vi.mock('../../../src/api/auth', async () => {
  const actual = await vi.importActual<typeof import('../../../src/api/auth')>(
    '../../../src/api/auth',
  );

  return {
    ...actual,
    getAdminOnboardingDepartments: vi.fn(),
    getAdminPendingOnboardingRequests: vi.fn(),
    approveOnboardingRequest: vi.fn(),
    rejectOnboardingRequest: vi.fn(),
  };
});

describe('AdminOnboardingPanel pending request notification', () => {
  beforeEach(() => {
    vi.mocked(getAdminOnboardingDepartments).mockResolvedValue([
      { id: 'front-office', name: 'Front Office', kind: 'GENERAL' },
    ]);
    vi.mocked(getAdminPendingOnboardingRequests).mockResolvedValue([
      {
        id: 'request-1',
        type: 'LINK_EXISTING',
        status: 'PENDING',
        departmentId: 'front-office',
        employeeId: 'employee-1',
        requestedDisplayName: null,
        reviewedAt: null,
        createdAt: '2026-09-23T10:00:00.000Z',
        updatedAt: '2026-09-23T10:00:00.000Z',
        employee: {
          id: 'employee-1',
          displayName: 'Катя Плющ',
        },
      },
    ]);
  });

  it('shows a badge and visible notification without opening the drawer', async () => {
    const user = userEvent.setup();

    render(
      <AppThemeProvider>
        <AdminOnboardingPanel />
      </AppThemeProvider>,
    );

    expect(
      await screen.findByTitle('Заявки на привязку аккаунтов: 1'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Новая заявка на привязку аккаунта'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Открыть заявки' }),
    );

    expect(await screen.findByText('Привязка аккаунтов')).toBeInTheDocument();
    expect(screen.queryByText(/\+7999/)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText('Новая заявка на привязку аккаунта'),
      ).not.toBeInTheDocument();
    });
  });
});
