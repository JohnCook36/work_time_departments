import { CalendarDays, ClipboardList, LayoutDashboard, Repeat2, UserRound } from 'lucide-react';

import { hasManagementAccess, useAuthUser } from '../../auth/AuthContext';
import { NavigationBar, NavigationLink } from './AppSectionNav.styles';

export function AppSectionNav() {
  const user = useAuthUser();
  const canManagePlanner = hasManagementAccess(user);

  return (
    <NavigationBar aria-label="Основная навигация">
      <NavigationLink to="/my-schedule">
        <CalendarDays size={16} />
        Мои смены
      </NavigationLink>

      <NavigationLink to="/tasks">
        <ClipboardList size={16} />
        Задачи
      </NavigationLink>

      <NavigationLink to="/shift-requests">
        <Repeat2 size={16} />
        Обмен сменами
      </NavigationLink>

      <NavigationLink to="/profile">
        <UserRound size={16} />
        Профиль
      </NavigationLink>

      {canManagePlanner && (
        <NavigationLink to="/planner">
          <LayoutDashboard size={16} />
          Планировщик
        </NavigationLink>
      )}
    </NavigationBar>
  );
}
