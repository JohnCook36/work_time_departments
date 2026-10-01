import {
  Bell,
  CalendarDays,
  ClipboardList,
  Clock3,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Repeat2,
  ScrollText,
  ShieldCheck,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { logout } from '../../api/auth';
import {
  hasCapability,
  hasManagementAccess,
  useAuthUser,
} from '../../auth/AuthContext';
import { useAuthSession } from '../../auth/AuthSessionProvider';
import { useAppTheme } from '../../theme/AppThemeProvider';
import {
  DrawerAction,
  DrawerBackdrop,
  DrawerCloseButton,
  DrawerGroup,
  DrawerGroupLabel,
  DrawerHeader,
  DrawerLink,
  DrawerPanel,
  DrawerTitle,
  MenuButton,
  MenuButtonRow,
} from './AppSectionNav.styles';

export function AppSectionNav() {
  const user = useAuthUser();
  const location = useLocation();
  const { refresh: refreshSession } = useAuthSession();
  const { themeMode, toggleTheme } = useAppTheme();
  const canManagePlanner = hasManagementAccess(user);
  const canReadAudit = hasCapability(user, 'AUDIT_READ');
  const canManageRoles = hasCapability(user, 'ROLE_MANAGE');
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    await refreshSession();
  };

  return (
    <>
      <MenuButtonRow>
        <MenuButton
          type="button"
          aria-expanded={menuOpen}
          aria-controls={drawerId}
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={19} />
          Меню
        </MenuButton>
      </MenuButtonRow>

      {menuOpen && (
        <>
          <DrawerBackdrop
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setMenuOpen(false)}
          />

          <DrawerPanel
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Навигация"
          >
            <DrawerHeader>
              <DrawerTitle>Навигация</DrawerTitle>
              <DrawerCloseButton
                type="button"
                aria-label="Закрыть меню"
                onClick={() => setMenuOpen(false)}
              >
                <X size={20} />
              </DrawerCloseButton>
            </DrawerHeader>

            <DrawerGroup aria-label="Основное">
              <DrawerGroupLabel>Основное</DrawerGroupLabel>
              <DrawerLink to="/my-schedule">
                <CalendarDays size={18} />
                Мои смены
              </DrawerLink>
              {canManagePlanner && (
                <DrawerLink to="/today">
                  <Gauge size={18} />
                  Сегодня
                </DrawerLink>
              )}
              {canManagePlanner && (
                <DrawerLink to="/planner">
                  <LayoutDashboard size={18} />
                  Планировщик
                </DrawerLink>
              )}
              {canManagePlanner && (
                <DrawerLink to="/plan-actual">
                  <Clock3 size={18} />
                  План / факт
                </DrawerLink>
              )}
              {canManagePlanner && (
                <DrawerLink to="/team-hours">
                  <Clock3 size={18} />
                  Часы команды
                </DrawerLink>
              )}
            </DrawerGroup>

            <DrawerGroup aria-label="Работа">
              <DrawerGroupLabel>Работа</DrawerGroupLabel>
              <DrawerLink to="/tasks">
                <ClipboardList size={18} />
                Задачи
              </DrawerLink>
              <DrawerLink to="/shift-requests">
                <Repeat2 size={18} />
                Обмен сменами
              </DrawerLink>
              <DrawerLink to="/notifications">
                <Bell size={18} />
                Уведомления
              </DrawerLink>
            </DrawerGroup>

            {(canManageRoles || canReadAudit) && (
              <DrawerGroup aria-label="Администрирование">
                <DrawerGroupLabel>Администрирование</DrawerGroupLabel>
                {canManageRoles && (
                  <DrawerLink to="/roles-access">
                    <ShieldCheck size={18} />
                    Роли и доступ
                  </DrawerLink>
                )}
                {canReadAudit && (
                  <DrawerLink to="/audit">
                    <ScrollText size={18} />
                    Журнал
                  </DrawerLink>
                )}
              </DrawerGroup>
            )}

            <DrawerGroup aria-label="Аккаунт">
              <DrawerGroupLabel>Аккаунт</DrawerGroupLabel>
              <DrawerLink to="/profile">
                <UserRound size={18} />
                Профиль
              </DrawerLink>
              <DrawerAction type="button" onClick={toggleTheme}>
                {themeMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                {themeMode === 'light' ? 'Тёмная тема' : 'Светлая тема'}
              </DrawerAction>
              <DrawerAction type="button" onClick={() => void handleLogout()}>
                <LogOut size={18} />
                Выйти
              </DrawerAction>
            </DrawerGroup>
          </DrawerPanel>
        </>
      )}
    </>
  );
}
