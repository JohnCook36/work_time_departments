import {
  ChevronLeft,
  ChevronRight,
  Info,
  CalendarDays,
  Moon,
  Sun,
} from 'lucide-react';

import { AdminOnboardingPanel } from '../onboarding/AdminOnboardingPanel';
import {
  BrandBlock,
  BrandTitle,
  Card,
  HeaderActions,
  HeaderCard,
  HeaderLeft,
  HeaderRow,
  HelpCard,
  HelpGrid,
  IconButton,
  MonthLabel,
  Muted,
  PanelTitle,
  PanelTitleRow,
  ThemeButton,
  TinyText,
} from '../../theme/styles';
import { MONTH_NAMES } from '../../utils/calendar';
import { PlannerServerStatus } from '../../hooks/usePlannerServerSync';
import {
  PersonalScheduleLink,
  ServerModeCard,
  ServerModeDescription,
} from './PlannerHeaderScreen.styles';

interface PlannerHeaderScreenProps {
  themeMode: 'light' | 'dark';
  onToggleTheme: () => void;
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canManagePlanner: boolean;
  showHelp: boolean;
  onToggleHelp: () => void;
  onCloseHelp: () => void;
  serverPlannerReadEnabled: boolean;
  serverPlannerWriteEnabled: boolean;
  serverPlannerStatus: PlannerServerStatus;
  serverPlannerError: string | null;
}

export function PlannerHeaderScreen({
  themeMode,
  onToggleTheme,
  year,
  month,
  onPrevMonth,
  onNextMonth,
  canManagePlanner,
  showHelp,
  onToggleHelp,
  onCloseHelp,
  serverPlannerReadEnabled,
  serverPlannerWriteEnabled,
  serverPlannerStatus,
  serverPlannerError,
}: PlannerHeaderScreenProps) {
  return (
    <>
      <HeaderCard>
        <HeaderRow>
          <HeaderLeft>
            <ThemeButton
              type="button"
              onClick={onToggleTheme}
              title={
                themeMode === 'light'
                  ? 'Включить тёмную тему'
                  : 'Включить светлую тему'
              }
            >
              {themeMode === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </ThemeButton>

            <BrandBlock>
              <BrandTitle>🏨 Планировщик смен</BrandTitle>
              <Muted>
                Расписание сотрудников отеля • Отделы • Drag & Drop • Пожелания
              </Muted>
            </BrandBlock>
          </HeaderLeft>

          <HeaderActions>
            <IconButton
              type="button"
              onClick={onPrevMonth}
              title="Предыдущий месяц"
            >
              <ChevronLeft size={19} />
            </IconButton>

            <MonthLabel>
              {MONTH_NAMES[month]} {year}
            </MonthLabel>

            <IconButton
              type="button"
              onClick={onNextMonth}
              title="Следующий месяц"
            >
              <ChevronRight size={19} />
            </IconButton>

            <PersonalScheduleLink to="/my-schedule" title="Мои смены">
              <CalendarDays size={18} />
            </PersonalScheduleLink>
            {canManagePlanner && <AdminOnboardingPanel />}

            {canManagePlanner && (
              <IconButton
                type="button"
                onClick={onToggleHelp}
                title="Справка"
              >
                <Info size={18} />
              </IconButton>
            )}
          </HeaderActions>
        </HeaderRow>
      </HeaderCard>

      {serverPlannerReadEnabled && (
        <ServerModeCard>
          <PanelTitle>Серверный режим графика</PanelTitle>
          <ServerModeDescription>
            {serverPlannerStatus === 'loading'
              ? 'Загружаю отделы, сотрудников и сохранённые смены с backend. Редактирование временно отключено.'
              : serverPlannerStatus === 'error'
                ? 'Не удалось обновить данные с backend. Редактирование заблокировано: ' +
                  (serverPlannerError || 'неизвестная ошибка')
                : serverPlannerWriteEnabled
                  ? 'Данные текущего месяца загружены с backend. Запись включена для смен и Employee; SUPER_ADMIN также может создавать, редактировать, деактивировать и менять порядок отделов.'
                  : 'Данные текущего месяца загружены с backend. Это контролируемый read-only этап миграции; локальные изменения отключены.'}
          </ServerModeDescription>
        </ServerModeCard>
      )}

      {canManagePlanner && showHelp && (
        <HelpCard>
          <PanelTitleRow>
            <div>
              <PanelTitle>Как пользоваться</PanelTitle>
              <Muted>
                Смены сохраняются отдельно для каждого месяца. Пожелания тоже
                привязаны к выбранному месяцу.
              </Muted>
            </div>
            <IconButton type="button" onClick={onCloseHelp}>
              ×
            </IconButton>
          </PanelTitleRow>

          <HelpGrid>
            <div>
              <TinyText>Обычная смена: 08:00-17:00</TinyText>
              <TinyText>С кодом: E 07:00-16:00</TinyText>
              <TinyText>Ночная N: N 20:00-08:00</TinyText>
              <TinyText>Выходной: OFF</TinyText>
            </div>
            <div>
              <TinyText>⋮⋮ — перетащить сотрудника.</TinyText>
              <TinyText>⋮⋮ в строке отдела — переместить весь отдел.</TinyText>
              <TinyText>▾ / › — свернуть или развернуть отдел.</TinyText>
              <TinyText>💬 — открыть пожелания сотрудника.</TinyText>
              <TinyText>Можно переносить людей между отделами.</TinyText>
            </div>
          </HelpGrid>
        </HelpCard>
      )}
    </>
  );
}
