import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';

import {
  getNotificationPreferences,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreference,
  type NotificationItem,
  type NotificationPreference,
} from '../../api/notifications';
import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import {
  EmptyState,
  SectionCard,
  SectionContainer,
  SectionGrid,
  SectionHeader,
  SectionPage,
  SectionSubtitle,
  SectionTitle,
} from '../shared/SectionPage.styles';
import {
  InboxButton,
  InboxHeaderRow,
  InboxItem,
  InboxList,
  InboxMeta,
  PreferenceRow,
} from './NotificationsScreen.styles';

const CATEGORY_LABELS = {
  SHIFT_CHANGE: 'Обмен сменами',
  SCHEDULE_PUBLICATION: 'График',
  TASK: 'Задачи',
  SCHEDULE_RULE: 'Правила графика',
  SYSTEM: 'Системное',
} as const;

function notificationText(item: NotificationItem) {
  if (item.category === 'SHIFT_CHANGE') {
    if (item.eventKey.endsWith(':CREATED')) return 'Вам предложили обмен или подмену смены.';
    if (item.eventKey.endsWith(':TARGET_ACCEPTED')) return 'Сотрудник согласился. Запрос ждёт решения руководителя.';
    if (item.eventKey.endsWith(':TARGET_REJECTED')) return 'Сотрудник отклонил запрос на изменение смены.';
    if (item.eventKey.endsWith(':CANCELED')) return 'Запрос на изменение смены отменён.';
    if (item.eventKey.endsWith(':MANAGER_APPROVED')) return 'Руководитель одобрил изменение смены.';
    if (item.eventKey.endsWith(':MANAGER_REJECTED')) return 'Руководитель отклонил изменение смены.';
  }
  return CATEGORY_LABELS[item.category] + ': новое событие.';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date);
}

export function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unreadCount = useMemo(
    () => items.filter(item => item.readAt === null).length,
    [items],
  );

  useEffect(() => {
    setBusy(true);
    Promise.all([getNotifications(), getNotificationPreferences()])
      .then(([page, nextPreferences]) => {
        setItems(page.items);
        setPreferences(nextPreferences);
        setError('');
      })
      .catch(value => {
        setError(value instanceof Error ? value.message : 'Не удалось загрузить уведомления.');
      })
      .finally(() => setBusy(false));
  }, []);

  const markRead = async (item: NotificationItem) => {
    if (item.readAt) return;
    setBusy(true);
    try {
      await markNotificationRead(item.id);
      const now = new Date().toISOString();
      setItems(current =>
        current.map(candidate =>
          candidate.id === item.id ? { ...candidate, readAt: now } : candidate,
        ),
      );
      setError('');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось отметить уведомление.');
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async () => {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems(current =>
        current.map(item => (item.readAt ? item : { ...item, readAt: now })),
      );
      setError('');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось отметить уведомления.');
    } finally {
      setBusy(false);
    }
  };

  const togglePreference = async (preference: NotificationPreference) => {
    if (!preference.configurable) return;
    setBusy(true);
    try {
      const updated = await updateNotificationPreference(
        preference.category,
        !preference.enabled,
      );
      setPreferences(current =>
        current.map(item =>
          item.category === updated.category ? updated : item,
        ),
      );
      setError('');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось изменить настройку.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionPage>
      <SectionContainer>
        <SectionHeader>
          <SectionTitle>Уведомления</SectionTitle>
          <SectionSubtitle>
            Здесь сохраняются события графика, обменов и других рабочих процессов.
          </SectionSubtitle>
          <AppSectionNav />
        </SectionHeader>

        <SectionGrid>
          <SectionCard>
            <InboxHeaderRow>
              <strong>
                <Bell size={16} /> Непрочитано: {unreadCount}
              </strong>
              <InboxButton
                type="button"
                disabled={busy || unreadCount === 0}
                onClick={() => void markAllRead()}
              >
                <CheckCheck size={15} /> Отметить всё прочитанным
              </InboxButton>
            </InboxHeaderRow>

            {error && <InboxMeta role="alert">{error}</InboxMeta>}

            {items.length === 0 && !busy ? (
              <EmptyState>Уведомлений пока нет.</EmptyState>
            ) : (
              <InboxList aria-label="Список уведомлений">
                {items.map(item => (
                  <InboxItem
                    key={item.id}
                    type="button"
                    $unread={item.readAt === null}
                    aria-label={notificationText(item)}
                    onClick={() => void markRead(item)}
                  >
                    <strong>{notificationText(item)}</strong>
                    <InboxMeta>
                      {CATEGORY_LABELS[item.category]} · {formatDate(item.createdAt)}
                      {item.critical ? ' · важное' : ''}
                    </InboxMeta>
                  </InboxItem>
                ))}
              </InboxList>
            )}
          </SectionCard>

          <SectionCard>
            <h2>Настройки</h2>
            {preferences.map(preference => (
              <PreferenceRow key={preference.category}>
                <span>{CATEGORY_LABELS[preference.category]}</span>
                <input
                  type="checkbox"
                  checked={preference.enabled}
                  disabled={!preference.configurable || busy}
                  onChange={() => void togglePreference(preference)}
                  aria-label={'Уведомления: ' + CATEGORY_LABELS[preference.category]}
                />
              </PreferenceRow>
            ))}
            <InboxMeta>
              Системные критичные уведомления отключить нельзя.
            </InboxMeta>
          </SectionCard>
        </SectionGrid>
      </SectionContainer>
    </SectionPage>
  );
}
