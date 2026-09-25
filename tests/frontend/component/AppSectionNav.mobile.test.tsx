import { ThemeProvider } from '@emotion/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { AuthUser } from '../../../src/api/auth';
import { AuthUserContext } from '../../../src/auth/AuthContext';
import { AppSectionNav } from '../../../src/components/navigation/AppSectionNav';
import { getTheme } from '../../../src/theme/theme';

function renderNav(user: AuthUser, path = '/my-schedule') {
  return render(
    <ThemeProvider theme={getTheme('light')}>
      <AuthUserContext.Provider value={user}>
        <MemoryRouter initialEntries={[path]}>
          <AppSectionNav />
        </MemoryRouter>
      </AuthUserContext.Provider>
    </ThemeProvider>,
  );
}

const employee: AuthUser = {
  id: 'user-employee',
  phoneE164: '+79990000001',
  employee: {
    id: 'employee-1',
    displayName: 'Employee',
    departmentId: 'department-a',
    departmentName: 'FO',
    employmentRate: 1,
    scheduleMode: 'FLEXIBLE',
    fixedStartTime: null,
    fixedEndTime: null,
  },
  memberships: [
    {
      id: 'membership-employee',
      role: 'EMPLOYEE',
      departmentId: 'department-a',
      permissions: [],
    },
  ],
};

describe('AppSectionNav mobile model', () => {
  it('keeps the employee mobile baseline to four labelled destinations', () => {
    renderNav(employee);

    const mobile = screen.getByRole('navigation', {
      name: 'Мобильная навигация',
      hidden: true,
    });
    expect(mobile).toHaveTextContent('Смены');
    expect(mobile).toHaveTextContent('Задачи');
    expect(mobile).toHaveTextContent('Обмен');
    expect(mobile).toHaveTextContent('Профиль');
    expect(mobile).not.toHaveTextContent('Ещё');
  });

  it('uses Planner / Requests / Tasks / More for a department admin', async () => {
        renderNav({
      ...employee,
      memberships: [
        {
          id: 'membership-admin',
          role: 'DEPARTMENT_ADMIN',
          departmentId: 'department-a',
          permissions: [],
        },
      ],
    });

    const mobile = screen.getByRole('navigation', {
      name: 'Мобильная навигация',
    });
    expect(mobile).toHaveTextContent('План');
    expect(mobile).toHaveTextContent('Запросы');
    expect(mobile).toHaveTextContent('Задачи');
    expect(mobile).toHaveTextContent('Ещё');

    fireEvent.click(
      within(mobile).getByRole('button', { name: /Ещё/, hidden: true }),
    );
    expect(
      screen.getByRole('region', {
        name: 'Дополнительная навигация',
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Уведомления/, hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Профиль/, hidden: true })).toBeInTheDocument();
  });

  it('does not expose unavailable secondary management links', async () => {
        renderNav({
      ...employee,
      memberships: [
        {
          id: 'membership-admin',
          role: 'DEPARTMENT_ADMIN',
          departmentId: 'department-a',
          permissions: [],
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: /Ещё/ }));

    expect(screen.queryByRole('link', { name: /Журнал/, hidden: true })).toBeNull();
    expect(screen.queryByRole('link', { name: /Роли и доступ/, hidden: true })).toBeNull();
  });

  it('gives a capability-bearing deputy a More sheet without planner access', async () => {
        renderNav({
      ...employee,
      memberships: [
        {
          id: 'membership-deputy',
          role: 'DEPUTY',
          departmentId: 'department-a',
          permissions: ['AUDIT_READ'],
        },
      ],
    });

    const mobile = screen.getByRole('navigation', {
      name: 'Мобильная навигация',
    });
    expect(mobile).toHaveTextContent('Смены');
    expect(mobile).not.toHaveTextContent('План');

    await user.click(screen.getByRole('button', { name: /Ещё/ }));
    expect(screen.getByRole('link', { name: /Журнал/, hidden: true })).toBeInTheDocument();
  });
});
