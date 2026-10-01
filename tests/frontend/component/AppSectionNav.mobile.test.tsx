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

function openDrawer() {
  fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
  return screen.getByRole('dialog', { name: 'Навигация' });
}

describe('AppSectionNav drawer model', () => {
  it('keeps employee navigation compact and excludes management routes', () => {
    renderNav(employee);

    expect(screen.queryByRole('navigation', { name: 'Мобильная навигация' })).not.toBeInTheDocument();
    const drawer = openDrawer();

    expect(within(drawer).getByRole('link', { name: /Мои смены/ })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /Задачи/ })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /Обмен сменами/ })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /Уведомления/ })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /Профиль/ })).toBeInTheDocument();
    expect(within(drawer).queryByRole('link', { name: /Сегодня/ })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('link', { name: /Планировщик/ })).not.toBeInTheDocument();
  });

  it('exposes management routes for a department admin', () => {
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
    }, '/today');

    const drawer = openDrawer();
    expect(within(drawer).getByRole('link', { name: /Сегодня/ })).toHaveClass('active');
    expect(within(drawer).getByRole('link', { name: /Планировщик/ })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /План \/ факт/ })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /Часы команды/ })).toBeInTheDocument();
  });

  it('exposes administration links for a department admin', () => {
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

    const drawer = openDrawer();
    expect(within(drawer).getByRole('link', { name: /Журнал/ })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /Роли и доступ/ })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /тема/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Выйти/ })).toBeInTheDocument();
  });

  it('gives an audit-capable deputy the journal without planner access', () => {
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

    const drawer = openDrawer();
    expect(within(drawer).getByRole('link', { name: /Журнал/ })).toBeInTheDocument();
    expect(within(drawer).queryByRole('link', { name: /Планировщик/ })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('link', { name: /Сегодня/ })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('link', { name: /Роли и доступ/ })).not.toBeInTheDocument();
  });
});
