import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Plus, Trash2, X } from 'lucide-react';

import {
  applyFoCoveragePreset,
  createScheduleRule,
  deleteScheduleRule,
  getManageableScheduleRules,
  getScheduleRuleHistory,
  ScheduleRuleHistoryResponse,
  ScheduleRuleKind,
  ScheduleRuleMutationInput,
  ScheduleRuleResponse,
  ScheduleRuleScope,
  ScheduleRuleSeverity,
  updateScheduleRule,
} from '../../api/planner';
import { Department } from '../../domain/models';
import {
  ActionButton,
  DrawerHeader,
  DrawerOverlay,
  DrawerSubtitle,
  DrawerTitle,
  FormGroup,
  FormLabel,
  IconButton,
} from '../../theme/styles';
import {
  CompactDrawer,
  DrawerButtonGrid,
  DrawerSection,
  DrawerSectionTitle,
  FullWidthActionButton,
  FullWidthInput,
  FullWidthSelect,
  FullWidthTextArea,
  PublicationHistoryMeta,
  RuleBadge,
  RuleCard,
  RuleConfigPanel,
  RuleFeedback,
  RuleHistoryPanel,
  RuleMetaRow,
  RulesList,
  TwoColumnGrid,
} from './styles';

interface ScheduleRulesDrawerProps {
  departments: Department[];
  serverMode: boolean;
  isSuperAdmin: boolean;
  onClose: () => void;
}

interface RuleFormState {
  name: string;
  description: string;
  kind: ScheduleRuleKind;
  scope: ScheduleRuleScope;
  scopeValue: string;
  departmentId: string;
  priority: string;
  severity: ScheduleRuleSeverity;
  isActive: boolean;
  violationMessage: string;
  maxConcurrent: string;
  time: string;
  minStaff: string;
}

function emptyForm(departments: Department[]): RuleFormState {
  return {
    name: '',
    description: '',
    kind: 'MAX_CONCURRENT_EMPLOYEES',
    scope: 'DEPARTMENT',
    scopeValue: '',
    departmentId: departments[0]?.id ?? '',
    priority: '100',
    severity: 'HARD',
    isActive: true,
    violationMessage: '',
    maxConcurrent: '5',
    time: '07:00',
    minStaff: '1',
  };
}

function formFromRule(
  rule: ScheduleRuleResponse,
  departments: Department[],
): RuleFormState {
  return {
    name: rule.name,
    description: rule.description,
    kind: rule.kind,
    scope: rule.scope,
    scopeValue: rule.scopeValue ?? '',
    departmentId: rule.departmentId ?? departments[0]?.id ?? '',
    priority: String(rule.priority),
    severity: rule.severity,
    isActive: rule.isActive,
    violationMessage: rule.violationMessage,
    maxConcurrent: String(rule.config.maxConcurrent ?? 5),
    time: String(rule.config.time ?? '07:00'),
    minStaff: String(rule.config.minStaff ?? 1),
  };
}

function kindLabel(kind: ScheduleRuleKind): string {
  return kind === 'MAX_CONCURRENT_EMPLOYEES'
    ? 'Максимум сотрудников одновременно'
    : 'Минимум сотрудников к времени';
}

function scopeLabel(scope: ScheduleRuleScope): string {
  if (scope === 'ORGANIZATION') return 'Организация';
  if (scope === 'DEPARTMENT') return 'Отдел';
  if (scope === 'ROLE') return 'Роль';
  return 'Тип смены';
}

function buildMutation(form: RuleFormState): ScheduleRuleMutationInput | null {
  const priority = Number(form.priority);
  if (
    !form.name.trim() ||
    !form.description.trim() ||
    !form.violationMessage.trim() ||
    !Number.isInteger(priority) ||
    priority < 0 ||
    priority > 1000
  ) {
    return null;
  }

  let config: Record<string, string | number>;
  if (form.kind === 'MAX_CONCURRENT_EMPLOYEES') {
    const maxConcurrent = Number(form.maxConcurrent);
    if (
      !Number.isInteger(maxConcurrent) ||
      maxConcurrent < 1 ||
      maxConcurrent > 100
    ) {
      return null;
    }
    config = { maxConcurrent };
  } else {
    const minStaff = Number(form.minStaff);
    if (
      !/^\d{2}:\d{2}$/.test(form.time) ||
      !Number.isInteger(minStaff) ||
      minStaff < 1 ||
      minStaff > 100
    ) {
      return null;
    }
    config = { time: form.time, minStaff };
  }

  if (form.scope === 'DEPARTMENT' && !form.departmentId) return null;
  if (
    (form.scope === 'ROLE' || form.scope === 'SHIFT_TYPE') &&
    !form.scopeValue
  ) {
    return null;
  }

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    kind: form.kind,
    scope: form.scope,
    scopeValue:
      form.scope === 'ROLE' || form.scope === 'SHIFT_TYPE'
        ? form.scopeValue
        : null,
    departmentId:
      form.scope === 'DEPARTMENT' ? form.departmentId : null,
    priority,
    severity: form.severity,
    isActive: form.isActive,
    config,
    violationMessage: form.violationMessage.trim(),
  };
}

export function ScheduleRulesDrawer({
  departments,
  serverMode,
  isSuperAdmin,
  onClose,
}: ScheduleRulesDrawerProps) {
  const [rules, setRules] = useState<ScheduleRuleResponse[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormState>(() =>
    emptyForm(departments),
  );
  const [history, setHistory] = useState<ScheduleRuleHistoryResponse[]>([]);
  const [historyRuleName, setHistoryRuleName] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);
  const foDepartments = useMemo(
    () => departments.filter((department) => department.kind === 'fo'),
    [departments],
  );
  const [foPresetDepartmentId, setFoPresetDepartmentId] = useState(
    () => foDepartments[0]?.id ?? '',
  );

  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedRuleId) ?? null,
    [rules, selectedRuleId],
  );

  const loadRules = useCallback(async () => {
    if (!serverMode) {
      setRules([]);
      setFeedback('Управление правилами доступно только в серверном режиме.');
      return;
    }

    setBusy(true);
    try {
      const loaded = await getManageableScheduleRules();
      setRules(loaded);
      setFeedback('');
    } catch (error) {
      setRules([]);
      setFeedback(
        error instanceof Error
          ? 'Не удалось загрузить правила: ' + error.message
          : 'Не удалось загрузить правила.',
      );
    } finally {
      setBusy(false);
    }
  }, [serverMode]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  useEffect(() => {
    if (
      foDepartments.length === 0 ||
      foDepartments.some((department) => department.id === foPresetDepartmentId)
    ) {
      return;
    }
    setFoPresetDepartmentId(foDepartments[0].id);
  }, [foDepartments, foPresetDepartmentId]);

  useEffect(() => {
    if (form.departmentId || departments.length === 0) return;
    setForm((current) => ({
      ...current,
      departmentId: departments[0].id,
    }));
  }, [departments, form.departmentId]);

  const applyFoPreset = async () => {
    if (!serverMode || busy || !foPresetDepartmentId) return;
    setBusy(true);
    try {
      const result = await applyFoCoveragePreset(foPresetDepartmentId);
      await loadRules();
      setFeedback(
        result.created > 0
          ? 'Стандарт FO добавлен: ' + result.created + ' правила.'
          : 'Стандарт FO уже настроен. Ничего не изменено.',
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? 'Не удалось применить стандарт FO: ' + error.message
          : 'Не удалось применить стандарт FO.',
      );
    } finally {
      setBusy(false);
    }
  };

  const startCreate = () => {
    setSelectedRuleId(null);
    setForm(emptyForm(departments));
    setFeedback('');
    setDeleteArmedId(null);
  };

  const startEdit = (rule: ScheduleRuleResponse) => {
    setSelectedRuleId(rule.id);
    setForm(formFromRule(rule, departments));
    setFeedback('');
    setDeleteArmedId(null);
  };

  const save = async () => {
    if (!serverMode || busy) return;
    const mutation = buildMutation(form);
    if (!mutation) {
      setFeedback('Проверьте обязательные поля и числовые значения правила.');
      return;
    }

    if (!isSuperAdmin && mutation.scope !== 'DEPARTMENT') {
      setFeedback('Для администратора отдела доступен только scope «Отдел».');
      return;
    }

    setBusy(true);
    try {
      if (selectedRule) {
        if (!selectedRule.editable) {
          setFeedback('Это правило доступно только для просмотра.');
          return;
        }
        const updated = await updateScheduleRule(selectedRule.id, {
          ...mutation,
          expectedUpdatedAt: selectedRule.updatedAt,
        });
        setFeedback('Правило обновлено. Версия v' + updated.version + '.');
        setSelectedRuleId(updated.id);
        setForm(formFromRule(updated, departments));
      } else {
        const created = await createScheduleRule(mutation);
        setFeedback('Правило создано. Версия v' + created.version + '.');
        setSelectedRuleId(created.id);
        setForm(formFromRule(created, departments));
      }
      await loadRules();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? 'Не удалось сохранить правило: ' + error.message
          : 'Не удалось сохранить правило.',
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleRule = async (rule: ScheduleRuleResponse) => {
    if (!rule.editable || busy) return;
    setBusy(true);
    setDeleteArmedId(null);
    try {
      await updateScheduleRule(rule.id, {
        isActive: !rule.isActive,
        expectedUpdatedAt: rule.updatedAt,
      });
      setFeedback(rule.isActive ? 'Правило выключено.' : 'Правило включено.');
      if (selectedRuleId === rule.id) {
        setSelectedRuleId(null);
        setForm(emptyForm(departments));
      }
      await loadRules();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? 'Не удалось изменить правило: ' + error.message
          : 'Не удалось изменить правило.',
      );
    } finally {
      setBusy(false);
    }
  };

  const removeRule = async (rule: ScheduleRuleResponse) => {
    if (!rule.editable || busy) return;
    if (deleteArmedId !== rule.id) {
      setDeleteArmedId(rule.id);
      setFeedback('Нажмите «Подтвердить удаление» ещё раз.');
      return;
    }

    setBusy(true);
    try {
      await deleteScheduleRule(rule.id, rule.updatedAt);
      setFeedback('Правило удалено; история версий сохранена.');
      setDeleteArmedId(null);
      if (selectedRuleId === rule.id) {
        setSelectedRuleId(null);
        setForm(emptyForm(departments));
      }
      await loadRules();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? 'Не удалось удалить правило: ' + error.message
          : 'Не удалось удалить правило.',
      );
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (rule: ScheduleRuleResponse) => {
    if (!serverMode || busy) return;
    setBusy(true);
    try {
      const versions = await getScheduleRuleHistory(rule.id);
      setHistory(versions);
      setHistoryRuleName(rule.name);
      setFeedback('');
    } catch (error) {
      setHistory([]);
      setHistoryRuleName('');
      setFeedback(
        error instanceof Error
          ? 'Не удалось загрузить историю: ' + error.message
          : 'Не удалось загрузить историю правила.',
      );
    } finally {
      setBusy(false);
    }
  };

  const formEditable = !selectedRule || selectedRule.editable;

  return (
    <DrawerOverlay onMouseDown={onClose}>
      <CompactDrawer onMouseDown={(event) => event.stopPropagation()}>
        <DrawerHeader>
          <div>
            <DrawerTitle>Правила графика</DrawerTitle>
            <DrawerSubtitle>
              Правила проверяются на backend перед публикацией и входят в
              снимок опубликованной версии.
            </DrawerSubtitle>
          </div>
          <IconButton type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </IconButton>
        </DrawerHeader>

        <DrawerSection>
          <DrawerButtonGrid>
            <ActionButton
              type="button"
              $variant="primary"
              disabled={!serverMode || busy}
              onClick={startCreate}
            >
              <Plus size={15} />
              Новое правило
            </ActionButton>
            <ActionButton
              type="button"
              disabled={!serverMode || busy}
              onClick={() => void loadRules()}
            >
              Обновить список
            </ActionButton>
          </DrawerButtonGrid>

          <DrawerSectionTitle>Стандарт Front Office</DrawerSectionTitle>
          {foDepartments.length === 0 ? (
            <PublicationHistoryMeta>
              Среди доступных отделов нет Front Office.
            </PublicationHistoryMeta>
          ) : (
            <DrawerButtonGrid>
              <FullWidthSelect
                aria-label="Отдел для стандарта FO"
                value={foPresetDepartmentId}
                disabled={!serverMode || busy}
                onChange={(event) => setFoPresetDepartmentId(event.target.value)}
              >
                {foDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </FullWidthSelect>
              <ActionButton
                type="button"
                disabled={!serverMode || busy || !foPresetDepartmentId}
                onClick={() => void applyFoPreset()}
              >
                Добавить стандарт FO
              </ActionButton>
            </DrawerButtonGrid>
          )}

          <RulesList aria-label="Список правил графика">
            {rules.length === 0 ? (
              <PublicationHistoryMeta>
                {busy ? 'Загружаю правила…' : 'Правил пока нет.'}
              </PublicationHistoryMeta>
            ) : (
              rules.map((rule) => (
                <RuleCard key={rule.id}>
                  <strong>{rule.name}</strong>
                  <RuleMetaRow>
                    <RuleBadge
                      $tone={rule.severity === 'HARD' ? 'hard' : 'soft'}
                    >
                      {rule.severity === 'HARD' ? 'Жёсткое' : 'Мягкое'}
                    </RuleBadge>
                    <RuleBadge
                      $tone={rule.isActive ? 'active' : 'inactive'}
                    >
                      {rule.isActive ? 'Активно' : 'Выключено'}
                    </RuleBadge>
                  </RuleMetaRow>
                  <PublicationHistoryMeta>
                    {kindLabel(rule.kind)} · {scopeLabel(rule.scope)} ·
                    приоритет {rule.priority} · v{rule.version}
                  </PublicationHistoryMeta>
                  <PublicationHistoryMeta>
                    {rule.description}
                  </PublicationHistoryMeta>
                  <DrawerButtonGrid>
                    <ActionButton
                      type="button"
                      onClick={() => startEdit(rule)}
                      disabled={busy}
                    >
                      {rule.editable ? 'Редактировать' : 'Просмотреть'}
                    </ActionButton>
                    <ActionButton
                      type="button"
                      onClick={() => void openHistory(rule)}
                      disabled={busy}
                    >
                      <History size={14} />
                      История
                    </ActionButton>
                    {rule.editable && (
                      <ActionButton
                        type="button"
                        onClick={() => void toggleRule(rule)}
                        disabled={busy}
                      >
                        {rule.isActive ? 'Выключить' : 'Включить'}
                      </ActionButton>
                    )}
                    {rule.editable && (
                      <ActionButton
                        type="button"
                        $variant="danger"
                        onClick={() => void removeRule(rule)}
                        disabled={busy}
                      >
                        <Trash2 size={14} />
                        {deleteArmedId === rule.id
                          ? 'Подтвердить удаление'
                          : 'Удалить'}
                      </ActionButton>
                    )}
                  </DrawerButtonGrid>
                </RuleCard>
              ))
            )}
          </RulesList>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionTitle>
            {selectedRule
              ? (selectedRule.editable ? 'Редактирование' : 'Просмотр') +
                ' · v' +
                selectedRule.version
              : 'Новое правило'}
          </DrawerSectionTitle>

          <FormGroup>
            <FormLabel htmlFor="rule-name">Название</FormLabel>
            <FullWidthInput
              id="rule-name"
              value={form.name}
              maxLength={120}
              disabled={!serverMode || busy || !formEditable}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="rule-description">Описание</FormLabel>
            <FullWidthTextArea
              id="rule-description"
              value={form.description}
              maxLength={4000}
              disabled={!serverMode || busy || !formEditable}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </FormGroup>

          <TwoColumnGrid>
            <FormGroup>
              <FormLabel htmlFor="rule-kind">Тип правила</FormLabel>
              <FullWidthSelect
                id="rule-kind"
                value={form.kind}
                disabled={!serverMode || busy || !formEditable}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    kind: event.target.value as ScheduleRuleKind,
                  }))
                }
              >
                <option value="MAX_CONCURRENT_EMPLOYEES">
                  Максимум одновременно
                </option>
                <option value="MIN_STAFF_AT_TIME">
                  Минимум к времени
                </option>
              </FullWidthSelect>
            </FormGroup>

            <FormGroup>
              <FormLabel htmlFor="rule-scope">Область</FormLabel>
              <FullWidthSelect
                id="rule-scope"
                value={form.scope}
                disabled={!serverMode || busy || !formEditable}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scope: event.target.value as ScheduleRuleScope,
                    scopeValue: '',
                  }))
                }
              >
                {isSuperAdmin && (
                  <option value="ORGANIZATION">Организация</option>
                )}
                <option value="DEPARTMENT">Отдел</option>
                {isSuperAdmin && <option value="ROLE">Роль</option>}
                {isSuperAdmin && (
                  <option value="SHIFT_TYPE">Тип смены</option>
                )}
              </FullWidthSelect>
            </FormGroup>
          </TwoColumnGrid>

          <RuleConfigPanel>
            {form.scope === 'DEPARTMENT' && (
              <FormGroup>
                <FormLabel htmlFor="rule-department">Отдел</FormLabel>
                <FullWidthSelect
                  id="rule-department"
                  value={form.departmentId}
                  disabled={!serverMode || busy || !formEditable}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      departmentId: event.target.value,
                    }))
                  }
                >
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </FullWidthSelect>
              </FormGroup>
            )}

            {form.scope === 'ROLE' && (
              <FormGroup>
                <FormLabel htmlFor="rule-role">Роль</FormLabel>
                <FullWidthSelect
                  id="rule-role"
                  value={form.scopeValue}
                  disabled={!serverMode || busy || !formEditable}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scopeValue: event.target.value,
                    }))
                  }
                >
                  <option value="">Выберите роль</option>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="DEPUTY">Deputy</option>
                  <option value="DEPARTMENT_ADMIN">Department Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </FullWidthSelect>
              </FormGroup>
            )}

            {form.scope === 'SHIFT_TYPE' && (
              <FormGroup>
                <FormLabel htmlFor="rule-shift-type">Тип смены</FormLabel>
                <FullWidthSelect
                  id="rule-shift-type"
                  value={form.scopeValue}
                  disabled={!serverMode || busy || !formEditable}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scopeValue: event.target.value,
                    }))
                  }
                >
                  <option value="">Выберите тип</option>
                  {['E', 'IN', 'INN', 'L', 'N'].map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </FullWidthSelect>
              </FormGroup>
            )}
          </RuleConfigPanel>

          <TwoColumnGrid>
            <FormGroup>
              <FormLabel htmlFor="rule-priority">Приоритет</FormLabel>
              <FullWidthInput
                id="rule-priority"
                type="number"
                min={0}
                max={1000}
                value={form.priority}
                disabled={!serverMode || busy || !formEditable}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value,
                  }))
                }
              />
            </FormGroup>
            <FormGroup>
              <FormLabel htmlFor="rule-severity">Строгость</FormLabel>
              <FullWidthSelect
                id="rule-severity"
                value={form.severity}
                disabled={!serverMode || busy || !formEditable}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    severity: event.target.value as ScheduleRuleSeverity,
                  }))
                }
              >
                <option value="HARD">Жёсткое · блокирует</option>
                <option value="SOFT">Мягкое · предупреждает</option>
              </FullWidthSelect>
            </FormGroup>
          </TwoColumnGrid>

          <FormGroup>
            <FormLabel htmlFor="rule-active">Состояние</FormLabel>
            <FullWidthSelect
              id="rule-active"
              value={form.isActive ? 'active' : 'inactive'}
              disabled={!serverMode || busy || !formEditable}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isActive: event.target.value === 'active',
                }))
              }
            >
              <option value="active">Активно</option>
              <option value="inactive">Выключено</option>
            </FullWidthSelect>
          </FormGroup>

          <RuleConfigPanel>
            {form.kind === 'MAX_CONCURRENT_EMPLOYEES' ? (
              <FormGroup>
                <FormLabel htmlFor="rule-max-concurrent">
                  Максимум одновременно
                </FormLabel>
                <FullWidthInput
                  id="rule-max-concurrent"
                  type="number"
                  min={1}
                  max={100}
                  value={form.maxConcurrent}
                  disabled={!serverMode || busy || !formEditable}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      maxConcurrent: event.target.value,
                    }))
                  }
                />
              </FormGroup>
            ) : (
              <TwoColumnGrid>
                <FormGroup>
                  <FormLabel htmlFor="rule-time">Время проверки</FormLabel>
                  <FullWidthInput
                    id="rule-time"
                    type="time"
                    value={form.time}
                    disabled={!serverMode || busy || !formEditable}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        time: event.target.value,
                      }))
                    }
                  />
                </FormGroup>
                <FormGroup>
                  <FormLabel htmlFor="rule-min-staff">
                    Минимум сотрудников
                  </FormLabel>
                  <FullWidthInput
                    id="rule-min-staff"
                    type="number"
                    min={1}
                    max={100}
                    value={form.minStaff}
                    disabled={!serverMode || busy || !formEditable}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        minStaff: event.target.value,
                      }))
                    }
                  />
                </FormGroup>
              </TwoColumnGrid>
            )}
          </RuleConfigPanel>

          <FormGroup>
            <FormLabel htmlFor="rule-message">
              Текст нарушения
            </FormLabel>
            <FullWidthTextArea
              id="rule-message"
              value={form.violationMessage}
              maxLength={500}
              disabled={!serverMode || busy || !formEditable}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  violationMessage: event.target.value,
                }))
              }
            />
          </FormGroup>

          <FullWidthActionButton
            type="button"
            $variant="primary"
            onClick={() => void save()}
            disabled={!serverMode || busy || !formEditable}
          >
            {busy
              ? 'Сохраняю…'
              : selectedRule
                ? 'Сохранить новую версию'
                : 'Создать правило'}
          </FullWidthActionButton>

          <RuleFeedback aria-live="polite">
            {feedback || ' '}
          </RuleFeedback>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionTitle>История версий</DrawerSectionTitle>
          <RuleHistoryPanel>
            {historyRuleName && (
              <strong>{historyRuleName}</strong>
            )}
            {history.length === 0 ? (
              <PublicationHistoryMeta>
                Выберите «История» у правила.
              </PublicationHistoryMeta>
            ) : (
              history.map((version) => (
                <RuleCard key={version.id}>
                  <strong>
                    v{version.version} ·{' '}
                    {new Date(version.createdAt).toLocaleString('ru-RU')}
                  </strong>
                  <PublicationHistoryMeta>
                    Изменил: {version.changedByLabel}
                  </PublicationHistoryMeta>
                  <PublicationHistoryMeta>
                    {String(version.snapshot.name ?? 'Правило')} ·{' '}
                    {String(
                      version.snapshot.isActive === false
                        ? 'выключено'
                        : 'активно',
                    )}
                  </PublicationHistoryMeta>
                </RuleCard>
              ))
            )}
          </RuleHistoryPanel>
        </DrawerSection>
      </CompactDrawer>
    </DrawerOverlay>
  );
}
