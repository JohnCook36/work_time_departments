import { useCallback, useEffect, useMemo, useState } from 'react';

import { getAuditEvents, type AuditEvent } from '../../api/audit';
import {
  getManageableDepartments,
  type ManageableDepartmentResponse,
} from '../../api/planner';
import { hasCapability, useAuthUser } from '../../auth/AuthContext';
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
  AuditActionButton,
  AuditActions,
  AuditFeedback,
  AuditField,
  AuditFiltersGrid,
  AuditInput,
  AuditItem,
  AuditItemTitle,
  AuditList,
  AuditMeta,
  AuditPager,
  AuditSelect,
} from './AuditScreen.styles';

const ACTION_LABELS: Record<string, string> = {
  EMPLOYEE_DEACTIVATED: 'Сотрудник деактивирован',
  DEPARTMENT_DEACTIVATED: 'Отдел деактивирован',
  SCHEDULE_CHANGED: 'График изменён',
  SCHEDULE_PUBLISHED: 'График опубликован',
  SCHEDULE_RULE_CREATED: 'Правило графика создано',
  SCHEDULE_RULE_UPDATED: 'Правило графика изменено',
  SCHEDULE_RULE_DELETED: 'Правило графика удалено',
  ONBOARDING_APPROVED: 'Заявка сотрудника подтверждена',
  ONBOARDING_REJECTED: 'Заявка сотрудника отклонена',
  SHIFT_CHANGE_MANAGER_APPROVED: 'Изменение смен одобрено',
  SHIFT_CHANGE_MANAGER_REJECTED: 'Изменение смен отклонено',
  ROLE_ASSIGNMENT_CREATED: 'Назначение роли создано',
  ROLE_PERMISSIONS_UPDATED: 'Права роли изменены',
  ROLE_ASSIGNMENT_DEACTIVATED: 'Назначение роли отключено',
};

const ENTITY_LABELS: Record<string, string> = {
  EMPLOYEE: 'Сотрудник',
  DEPARTMENT: 'Отдел',
  SCHEDULE: 'График',
  SCHEDULE_RULE: 'Правило графика',
  ONBOARDING_REQUEST: 'Заявка сотрудника',
  SHIFT_CHANGE_REQUEST: 'Запрос изменения смен',
  MEMBERSHIP: 'Назначение роли',
};

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function AuditScreen() {
  const user = useAuthUser();
  const isSuperAdmin = user.memberships.some(
    membership => membership.role === 'SUPER_ADMIN',
  );
  const [departments, setDepartments] = useState<ManageableDepartmentResponse[]>(
    [],
  );
  const [departmentId, setDepartmentId] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const canReadAudit = hasCapability(user, 'AUDIT_READ');

  const departmentNames = useMemo(
    () => new Map(departments.map(department => [department.id, department.name])),
    [departments],
  );

  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (!canReadAudit || busy) return;
      setBusy(true);
      try {
        const result = await getAuditEvents({
          ...(departmentId ? { departmentId } : {}),
          ...(action ? { action } : {}),
          ...(entityType ? { entityType } : {}),
          ...(toIso(from) ? { from: toIso(from) } : {}),
          ...(toIso(to) ? { to: toIso(to) } : {}),
          ...(cursor ? { cursor } : {}),
          limit: 30,
        });
        setItems(current => (append ? [...current, ...result.items] : result.items));
        setNextCursor(result.nextCursor);
        setFeedback('');
      } catch (error) {
        if (!append) setItems([]);
        setFeedback(
          error instanceof Error
            ? 'Не удалось загрузить журнал: ' + error.message
            : 'Не удалось загрузить журнал.',
        );
      } finally {
        setBusy(false);
      }
    },
    [action, busy, canReadAudit, departmentId, entityType, from, to],
  );

  useEffect(() => {
    if (!canReadAudit) return;
    void getManageableDepartments()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, [canReadAudit]);

  useEffect(() => {
    if (canReadAudit) void load();
    // Initial load only; filters apply through the explicit button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReadAudit]);

  if (!canReadAudit) {
    return (
      <SectionPage>
        <SectionContainer>
          <SectionHeader>
            <SectionTitle>Журнал действий</SectionTitle>
            <AppSectionNav />
          </SectionHeader>
          <SectionCard>
            <EmptyState>Нет доступа к журналу действий.</EmptyState>
          </SectionCard>
        </SectionContainer>
      </SectionPage>
    );
  }

  return (
    <SectionPage>
      <SectionContainer>
        <SectionHeader>
          <SectionTitle>Журнал действий</SectionTitle>
          <SectionSubtitle>
            Критические административные события. Журнал не содержит телефоны,
            адреса и содержимое изменённых данных.
          </SectionSubtitle>
          <AppSectionNav />
        </SectionHeader>

        <SectionGrid>
          <SectionCard>
            <AuditFiltersGrid>
              <AuditField>
                Отдел
                <AuditSelect
                  value={departmentId}
                  onChange={event => setDepartmentId(event.target.value)}
                >
                  {isSuperAdmin && <option value="">Все доступные события</option>}
                  {!isSuperAdmin && <option value="">Все доступные отделы</option>}
                  {departments.map(department => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </AuditSelect>
              </AuditField>

              <AuditField>
                Действие
                <AuditSelect
                  value={action}
                  onChange={event => setAction(event.target.value)}
                >
                  <option value="">Все действия</option>
                  {Object.entries(ACTION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </AuditSelect>
              </AuditField>

              <AuditField>
                Тип объекта
                <AuditSelect
                  value={entityType}
                  onChange={event => setEntityType(event.target.value)}
                >
                  <option value="">Все объекты</option>
                  {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </AuditSelect>
              </AuditField>

              <AuditField>
                С даты
                <AuditInput
                  type="datetime-local"
                  value={from}
                  onChange={event => setFrom(event.target.value)}
                />
              </AuditField>

              <AuditField>
                По дату
                <AuditInput
                  type="datetime-local"
                  value={to}
                  onChange={event => setTo(event.target.value)}
                />
              </AuditField>
            </AuditFiltersGrid>

            <AuditActions>
              <AuditActionButton
                type="button"
                $variant="primary"
                disabled={busy}
                onClick={() => void load()}
              >
                {busy ? 'Загружаю…' : 'Применить фильтры'}
              </AuditActionButton>
              <AuditActionButton
                type="button"
                disabled={busy}
                onClick={() => {
                  setDepartmentId('');
                  setAction('');
                  setEntityType('');
                  setFrom('');
                  setTo('');
                  setItems([]);
                  setNextCursor(null);
                  setFeedback('Фильтры очищены. Нажмите «Применить фильтры».');
                }}
              >
                Сбросить
              </AuditActionButton>
            </AuditActions>

            <AuditFeedback role={feedback ? 'alert' : 'status'} $error={!!feedback}>
              {feedback || ' '}
            </AuditFeedback>
          </SectionCard>

          <SectionCard>
            {items.length === 0 && !busy ? (
              <EmptyState>Событий по выбранным условиям нет.</EmptyState>
            ) : (
              <AuditList aria-label="События журнала">
                {items.map(item => (
                  <AuditItem key={item.id}>
                    <AuditItemTitle>
                      {ACTION_LABELS[item.action] || item.action}
                    </AuditItemTitle>
                    <AuditMeta>
                      {item.actorLabel} · {new Date(item.createdAt).toLocaleString('ru-RU')}
                    </AuditMeta>
                    <AuditMeta>
                      {ENTITY_LABELS[item.entityType] || item.entityType} · ID {item.entityId}
                    </AuditMeta>
                    {item.departmentId && (
                      <AuditMeta>
                        Отдел: {departmentNames.get(item.departmentId) || item.departmentId}
                      </AuditMeta>
                    )}
                  </AuditItem>
                ))}
              </AuditList>
            )}

            {nextCursor && (
              <AuditPager>
                <AuditActionButton
                  type="button"
                  disabled={busy}
                  onClick={() => void load(nextCursor, true)}
                >
                  {busy ? 'Загружаю…' : 'Показать ещё'}
                </AuditActionButton>
              </AuditPager>
            )}
          </SectionCard>
        </SectionGrid>
      </SectionContainer>
    </SectionPage>
  );
}
