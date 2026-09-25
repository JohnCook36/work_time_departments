import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type AbsenceResponse,
  type AbsenceType,
  cancelPlannerAbsence,
  createPlannerAbsence,
  getDepartmentAbsences,
  updatePlannerAbsence,
} from '../../api/planner';
import type { Employee } from '../../domain/models';
import {
  ActionButton,
  FormGroup,
  FormLabel,
  Select,
  TextInput,
} from '../../theme/styles';
import {
  AbsenceActions,
  AbsenceButton,
  AbsenceFeedback,
  AbsenceGrid,
  AbsenceItem,
  AbsenceList,
  AbsenceMeta,
  AbsencePanel,
  AbsenceStatus,
} from './AbsenceManagement.styles';

const TYPE_LABELS: Record<AbsenceType, string> = {
  VACATION: 'Отпуск',
  SICK: 'Больничный',
  TRAINING: 'Обучение',
  BUSINESS_TRIP: 'Командировка',
  UNAVAILABLE: 'Недоступность',
};

function monthBounds(year: number, monthIndex: number) {
  const first = String(year) + '-' + String(monthIndex + 1).padStart(2, '0') + '-01';
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const last =
    String(year) +
    '-' +
    String(monthIndex + 1).padStart(2, '0') +
    '-' +
    String(lastDay).padStart(2, '0');
  return { first, last };
}

interface AbsenceManagementProps {
  departmentId: string;
  employees: Employee[];
  year: number;
  monthIndex: number;
  canEdit: boolean;
}

export function AbsenceManagement({
  departmentId,
  employees,
  year,
  monthIndex,
  canEdit,
}: AbsenceManagementProps) {
  const bounds = useMemo(
    () => monthBounds(year, monthIndex),
    [monthIndex, year],
  );
  const departmentEmployees = useMemo(
    () => employees.filter(employee => employee.departmentId === departmentId),
    [departmentId, employees],
  );

  const [items, setItems] = useState<AbsenceResponse[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<AbsenceType>('VACATION');
  const [startDate, setStartDate] = useState(bounds.first);
  const [endDate, setEndDate] = useState(bounds.first);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState<AbsenceResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setEmployeeId(current =>
      current &&
      departmentEmployees.some(employee => employee.id === current)
        ? current
        : departmentEmployees[0]?.id ?? '',
    );
  }, [departmentEmployees]);

  useEffect(() => {
    setStartDate(bounds.first);
    setEndDate(bounds.first);
    setEditing(null);
    setComment('');
  }, [bounds.first, departmentId]);

  const load = useCallback(async () => {
    if (!departmentId) {
      setItems([]);
      return;
    }

    setBusy(true);
    try {
      setItems(
        await getDepartmentAbsences(
          departmentId,
          bounds.first,
          bounds.last,
        ),
      );
      setFeedback('');
    } catch (error) {
      setItems([]);
      setFeedback(
        error instanceof Error
          ? 'Не удалось загрузить отсутствия: ' + error.message
          : 'Не удалось загрузить отсутствия.',
      );
    } finally {
      setBusy(false);
    }
  }, [bounds.first, bounds.last, departmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setType('VACATION');
    setStartDate(bounds.first);
    setEndDate(bounds.first);
    setComment('');
  };

  const submit = async () => {
    if (!employeeId || busy) return;
    if (endDate < startDate) {
      setFeedback('Дата окончания не может быть раньше даты начала.');
      return;
    }

    setBusy(true);
    try {
      if (editing) {
        await updatePlannerAbsence(editing.id, {
          type,
          startDate,
          endDate,
          comment: type === 'SICK' ? null : comment.trim() || null,
          expectedUpdatedAt: editing.updatedAt,
        });
        setFeedback('Отсутствие обновлено.');
      } else {
        await createPlannerAbsence({
          employeeId,
          type,
          startDate,
          endDate,
          ...(type === 'SICK'
            ? {}
            : { comment: comment.trim() || null }),
        });
        setFeedback('Отсутствие добавлено.');
      }
      resetForm();
      await load();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? 'Не удалось сохранить отсутствие: ' + error.message
          : 'Не удалось сохранить отсутствие.',
      );
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (item: AbsenceResponse) => {
    setEditing(item);
    setEmployeeId(item.employeeId);
    setType(item.type);
    setStartDate(item.startDate);
    setEndDate(item.endDate);
    setComment(item.comment ?? '');
    setFeedback('Редактирование отсутствия.');
  };

  const cancelAbsence = async (item: AbsenceResponse) => {
    if (busy || item.status === 'CANCELED') return;
    setBusy(true);
    try {
      await cancelPlannerAbsence(item.id, item.updatedAt);
      setFeedback('Отсутствие отменено.');
      if (editing?.id === item.id) resetForm();
      await load();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? 'Не удалось отменить отсутствие: ' + error.message
          : 'Не удалось отменить отсутствие.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AbsencePanel aria-label="Структурированные отсутствия">
      <AbsenceGrid>
        <FormGroup>
          <FormLabel htmlFor="absence-employee">Сотрудник</FormLabel>
          <Select
            id="absence-employee"
            value={employeeId}
            disabled={!canEdit || busy || Boolean(editing)}
            onChange={event => setEmployeeId(event.target.value)}
          >
            {departmentEmployees.map(employee => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </Select>
        </FormGroup>

        <FormGroup>
          <FormLabel htmlFor="absence-type">Тип</FormLabel>
          <Select
            id="absence-type"
            value={type}
            disabled={!canEdit || busy}
            onChange={event => {
              const next = event.target.value as AbsenceType;
              setType(next);
              if (next === 'SICK') setComment('');
            }}
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormGroup>
      </AbsenceGrid>

      <AbsenceGrid>
        <FormGroup>
          <FormLabel htmlFor="absence-start">С</FormLabel>
          <TextInput
            id="absence-start"
            type="date"
            value={startDate}
            disabled={!canEdit || busy}
            onChange={event => setStartDate(event.target.value)}
          />
        </FormGroup>
        <FormGroup>
          <FormLabel htmlFor="absence-end">По</FormLabel>
          <TextInput
            id="absence-end"
            type="date"
            value={endDate}
            disabled={!canEdit || busy}
            onChange={event => setEndDate(event.target.value)}
          />
        </FormGroup>
      </AbsenceGrid>

      <FormGroup>
        <FormLabel htmlFor="absence-comment">Рабочая заметка</FormLabel>
        <TextInput
          id="absence-comment"
          value={comment}
          maxLength={240}
          disabled={!canEdit || busy || type === 'SICK'}
          placeholder={
            type === 'SICK'
              ? 'Для больничного заметка не хранится'
              : 'Необязательно, до 240 символов'
          }
          onChange={event => setComment(event.target.value)}
        />
      </FormGroup>

      <AbsenceActions>
        <ActionButton
          type="button"
          $variant="primary"
          disabled={!canEdit || busy || !employeeId}
          onClick={() => void submit()}
        >
          {busy ? 'Сохраняю…' : editing ? 'Сохранить изменения' : 'Добавить отсутствие'}
        </ActionButton>
        {editing && (
          <ActionButton
            type="button"
            disabled={busy}
            onClick={resetForm}
          >
            Отменить редактирование
          </ActionButton>
        )}
      </AbsenceActions>

      <AbsenceFeedback role="status">{feedback}</AbsenceFeedback>

      <AbsenceList aria-label="Список отсутствий">
        {items.length === 0 ? (
          <AbsenceMeta>На выбранный месяц отсутствий нет.</AbsenceMeta>
        ) : (
          items.map(item => {
            const employee = employees.find(candidate => candidate.id === item.employeeId);
            return (
              <AbsenceItem key={item.id}>
                <div>
                  <strong>{employee?.name ?? 'Сотрудник'}</strong>{' '}
                  <AbsenceStatus $canceled={item.status === 'CANCELED'}>
                    {item.status === 'CANCELED' ? 'Отменено' : TYPE_LABELS[item.type]}
                  </AbsenceStatus>
                </div>
                <AbsenceMeta>
                  {item.startDate} — {item.endDate}
                  {item.comment ? ' · ' + item.comment : ''}
                </AbsenceMeta>
                {canEdit && item.status === 'ACTIVE' && (
                  <AbsenceActions>
                    <AbsenceButton type="button" onClick={() => beginEdit(item)}>
                      Редактировать
                    </AbsenceButton>
                    <AbsenceButton
                      type="button"
                      $variant="danger"
                      disabled={busy}
                      onClick={() => void cancelAbsence(item)}
                    >
                      Отменить отсутствие
                    </AbsenceButton>
                  </AbsenceActions>
                )}
              </AbsenceItem>
            );
          })
        )}
      </AbsenceList>
    </AbsencePanel>
  );
}
