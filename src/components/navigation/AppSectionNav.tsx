import { Global } from '@emotion/react';
import {
  Bell,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Repeat2,
  ScrollText,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import {
  hasCapability,
  hasManagementAccess,
  useAuthUser,
} from '../../auth/AuthContext';
import {
  MobileMoreBackdrop,
  MobileMoreLink,
  MobileMoreSheet,
  MobileNavigationBar,
  MobileNavigationButton,
  MobileNavigationLink,
  NavigationBar,
  NavigationLink,
} from './AppSectionNav.styles';

export function AppSectionNav() {
  const user = useAuthUser();
  const location = useLocation();
  const canManagePlanner = hasManagementAccess(user);
  const canReadAudit = hasCapability(user, 'AUDIT_READ');
  const canManageRoles = hasCapability(user, 'ROLE_MANAGE');
  const hasSecondaryManagement = canReadAudit || canManageRoles;
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const managerMobile = canManagePlanner || hasSecondaryManagement;
  const moreRouteActive = [
    '/notifications',
    '/profile',
    '/roles-access',
    '/audit',
    '/my-schedule',
  ].includes(location.pathname) && managerMobile;

  return (
    <>
      <Global
        styles={{
          '@media (max-width: 720px)': {
            body: {
              paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
            },
          },
        }}
      />

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

        <NavigationLink to="/notifications">
          <Bell size={16} />
          Уведомления
        </NavigationLink>

        <NavigationLink to="/profile">
          <UserRound size={16} />
          Профиль
        </NavigationLink>

        {canManageRoles && (
          <NavigationLink to="/roles-access">
            <ShieldCheck size={16} />
            Роли и доступ
          </NavigationLink>
        )}

        {canReadAudit && (
          <NavigationLink to="/audit">
            <ScrollText size={16} />
            Журнал
          </NavigationLink>
        )}

        {canManagePlanner && (
          <NavigationLink to="/planner">
            <LayoutDashboard size={16} />
            Планировщик
          </NavigationLink>
        )}
      </NavigationBar>

      {managerMobile ? (
        <MobileNavigationBar aria-label="Мобильная навигация">
          {canManagePlanner ? (
            <MobileNavigationLink to="/planner">
              <LayoutDashboard size={20} />
              План
            </MobileNavigationLink>
          ) : (
            <MobileNavigationLink to="/my-schedule">
              <CalendarDays size={20} />
              Смены
            </MobileNavigationLink>
          )}

          <MobileNavigationLink to="/shift-requests">
            <Repeat2 size={20} />
            Запросы
          </MobileNavigationLink>

          <MobileNavigationLink to="/tasks">
            <ClipboardList size={20} />
            Задачи
          </MobileNavigationLink>

          <MobileNavigationButton
            type="button"
            $active={moreRouteActive}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-navigation"
            onClick={() => setMoreOpen(current => !current)}
          >
            <Menu size={20} />
            Ещё
          </MobileNavigationButton>
        </MobileNavigationBar>
      ) : (
        <MobileNavigationBar aria-label="Мобильная навигация">
          <MobileNavigationLink to="/my-schedule">
            <CalendarDays size={20} />
            Смены
          </MobileNavigationLink>
          <MobileNavigationLink to="/tasks">
            <ClipboardList size={20} />
            Задачи
          </MobileNavigationLink>
          <MobileNavigationLink to="/shift-requests">
            <Repeat2 size={20} />
            Обмен
          </MobileNavigationLink>
          <MobileNavigationLink to="/profile">
            <UserRound size={20} />
            Профиль
          </MobileNavigationLink>
        </MobileNavigationBar>
      )}

      {managerMobile && moreOpen && (
        <>
          <MobileMoreBackdrop
            type="button"
            aria-label="Закрыть дополнительную навигацию"
            onClick={() => setMoreOpen(false)}
          />
          <MobileMoreSheet
            id="mobile-more-navigation"
            aria-label="Дополнительная навигация"
          >
            <MobileMoreLink to="/notifications">
              <Bell size={18} />
              Уведомления
            </MobileMoreLink>
            <MobileMoreLink to="/profile">
              <UserRound size={18} />
              Профиль
            </MobileMoreLink>
            {canManageRoles && (
              <MobileMoreLink to="/roles-access">
                <ShieldCheck size={18} />
                Роли и доступ
              </MobileMoreLink>
            )}
            {canReadAudit && (
              <MobileMoreLink to="/audit">
                <ScrollText size={18} />
                Журнал
              </MobileMoreLink>
            )}
            {canManagePlanner && location.pathname !== '/my-schedule' && (
              <MobileMoreLink to="/my-schedule">
                <CalendarDays size={18} />
                Мои смены
              </MobileMoreLink>
            )}
          </MobileMoreSheet>
        </>
      )}
    </>
  );
}
