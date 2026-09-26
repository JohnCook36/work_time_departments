import { ThemeProvider } from '@emotion/react';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthUser } from '../../../src/api/auth';
import {
  getManagementHours,
  getManagementToday,
} from '../../../src/api/management';
import { AuthUserContext } from '../../../src/auth/AuthContext';
import { TeamHoursScreen } from '../../../src/screens/management/TeamHoursScreen';
import { TodayScreen } from '../../../src/screens/management/TodayScreen';
import { getTheme } from '../../../src/theme/theme';

vi.mock('../../../src/api/management', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../src/api/management')>()),
  getManagementToday: vi.fn(),
  getManagementHours: vi.fn(),
}));

const admin: AuthUser = {
  id: 'user-admin',
  phoneE164: '+79990000000',
  employee: {
    id: 'employee-admin',
    displayName: 'Manager',
    departmentId: 'department-a',
    departmentName: 'Front Office',
    employmentRate: 1,
    scheduleMode: 'FLEXIBLE',
    fixedStartTime: null,
    fixedEndTime: null,
  },
  memberships: [
    {
      id: 'membership-admin',
      role: 'DEPARTMENT_ADMIN',
      departmentId: 'department-a',
      permissions: [],
    },
  ],
};

function renderScreen(node: ReactElement) {
  return render(
    <ThemeProvider theme={getTheme('light')}>
      <AuthUserContext.Provider value={admin}>
        <MemoryRouter>{node}</MemoryRouter>
      </AuthUserContext.Provider>
    </ThemeProvider>,
  );
}

describe('management dashboards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getManagementToday).mockResolvedValue({
      date: '2026-09-26',
      attendanceAvailable: false,
      totals: {
        plannedShifts: 1,
        activeAbsences: 1,
        pendingRequests: 1,
        unpublishedDepartments: 0,
      },
      departments: [
        {
          id: 'department-a',
          name: 'Front Office',
          kind: 'FO',
          publication: {
            id: 'publication-1',
            version: 3,
            publishedAt: '2026-09-25T10:00:00.000Z',
          },
          plannedShifts: [
            {
              id: 'shift-1',
              employeeId: 'employee-1',
              displayName: 'Иванов И.И.',
              date: '2026-09-26',
              code: null,
              startTime: '08:00',
              endTime: '17:00',
            },
          ],
          absences: [
            {
              id: 'absence-1',
              employeeId: 'employee-2',
              displayName: 'Петров П.П.',
              type: 'SICK',
              startDate: '2026-09-26',
              endDate: '2026-09-26',
              comment: null,
            },
          ],
          riskCount: 2,
        },
      ],
      pendingRequests: [
        {
          id: 'request-1',
          kind: 'COVER',
          status: 'PENDING_MANAGER',
          requesterDepartmentId: 'department-a',
          targetDepartmentId: 'department-a',
          requesterDisplayName: 'Иванов И.И.',
          targetDisplayName: 'Петров П.П.',
          requesterShift: {
            date: '2026-09-26',
            startTime: '08:00',
            endTime: '17:00',
            code: null,
          },
          targetShift: null,
          createdAt: '2026-09-25T18:00:00.000Z',
        },
      ],
    });
    vi.mocked(getManagementHours).mockResolvedValue({
      period: { year: 2026, month: 9 },
      schedule: { id: 'schedule-1', updatedAt: '2026-09-25T10:00:00.000Z' },
      departmentNormConfigured: false,
      departments: [
        {
          id: 'department-a',
          name: 'Front Office',
          kind: 'FO',
          employeeCount: 1,
          plannedHours: 180,
          normHours: 176,
          deltaHours: 4,
          outsideNormCount: 1,
        },
      ],
      employees: [
        {
          id: 'employee-1',
          displayName: 'Иванов И.И.',
          departmentId: 'department-a',
          employmentRate: 1,
          shiftCount: 20,
          dayHours: 160,
          nightHours: 20,
          plannedHours: 180,
          productionNormHours: 176,
          departmentNormHours: null,
          comparisonNormHours: 176,
          deltaHours: 4,
          status: 'over',
        },
      ],
    });
  });

  it('renders published plan, absences and manager requests without fake attendance', async () => {
    renderScreen(<TodayScreen />);

    expect(await screen.findByText('Иванов И.И.')).toBeInTheDocument();
    expect(screen.getByText('Петров П.П.')).toBeInTheDocument();
    expect(screen.getByText('Опубликована версия v3')).toBeInTheDocument();
    expect(screen.getByText(/Явка не показывается/)).toBeInTheDocument();
    expect(screen.getByText('запросов руководителю')).toBeInTheDocument();
  });

  it('renders planned hours and labels over/under as schedule variance', async () => {
    renderScreen(<TeamHoursScreen />);

    await waitFor(() => expect(getManagementHours).toHaveBeenCalled());
    expect(await screen.findByText('Иванов И.И.')).toBeInTheDocument();
    expect(screen.getByText('Переработка по графику')).toBeInTheDocument();
    expect(screen.getByText(/Это не фактическая посещаемость/)).toBeInTheDocument();
    expect(screen.getByText(/Отдельная норма отдела пока не настроена/)).toBeInTheDocument();
  });
});
