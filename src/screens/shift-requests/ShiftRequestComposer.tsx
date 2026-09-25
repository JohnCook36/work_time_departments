import { useEffect, useState } from 'react';
import type { MyScheduleShift } from '../../api/auth';
import { ApiError } from '../../api/auth';
import {
  createShiftChangeRequest, getShiftChangeTargets, getShiftChangeTargetShift,
  ShiftChangeKind, ShiftChangeTarget, ShiftChangeTargetShift,
} from '../../api/shiftChangeRequests';
import {
  RequestActions, RequestButton, RequestFeedback, RequestField, RequestGrid,
  RequestHeading, RequestInput, RequestPanel, RequestSelect, RequestText,
} from './ShiftRequestsScreen.styles';

export function eligibleSourceShifts(shifts: MyScheduleShift[], published: boolean) {
  return published ? shifts.filter(shift =>
    !shift.id.startsWith('default:') && !shift.isOff && !!shift.startTime && !!shift.endTime,
  ) : [];
}

export function ShiftRequestComposer({ sources, initialShiftId, onCreated, onConflict, onClose }: {
  sources: MyScheduleShift[];
  initialShiftId?: string;
  onCreated: () => void | Promise<void>;
  onConflict?: () => void | Promise<void>;
  onClose?: () => void;
}) {
  const [sourceId, setSourceId] = useState(initialShiftId ?? sources[0]?.id ?? '');
  const [kind, setKind] = useState<ShiftChangeKind>('COVER');
  const [targets, setTargets] = useState<ShiftChangeTarget[]>([]);
  const [targetId, setTargetId] = useState('');
  const source = sources.find(shift => shift.id === sourceId);
  const [targetDate, setTargetDate] = useState(source?.date ?? '');
  const [targetShift, setTargetShift] = useState<ShiftChangeTargetShift | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getShiftChangeTargets().then(value => {
      if (active) setTargets(value);
    }).catch(() => {
      if (active) setFeedback('Не удалось загрузить сотрудников. Обновите страницу.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setTargetShift(null);
    setLookupError('');
    if (kind !== 'SWAP' || !targetId || !targetDate || !sourceId) return;
    let active = true;
    void getShiftChangeTargetShift(targetId, targetDate, sourceId).then(value => {
      if (active && value.date === targetDate) setTargetShift(value);
    }).catch(() => {
      if (active) setLookupError('На эту дату доступной смены для обмена нет.');
    });
    return () => { active = false; };
  }, [kind, targetId, targetDate, sourceId]);

  const submit = async () => {
    if (!source || !targetId || (kind === 'SWAP' && !targetShift)) return;
    setBusy(true);
    setFeedback('');
    try {
      await createShiftChangeRequest({
        kind, requesterShiftId: source.id, targetEmployeeId: targetId,
        ...(kind === 'SWAP' && targetShift ? { targetShiftId: targetShift.id } : {}),
      });
      await onCreated();
      setFeedback('Запрос отправлен сотруднику.');
      onClose?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await onConflict?.();
      setFeedback(error instanceof ApiError && error.status === 409
        ? 'Смена уже изменилась. Обновите данные и попробуйте снова.'
        : error instanceof Error ? error.message : 'Не удалось отправить запрос.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequestPanel aria-label="Новый запрос">
      <RequestHeading>Новый запрос</RequestHeading>
      <RequestGrid>
        <RequestField>Ваша смена
          <RequestSelect aria-label="Ваша смена" value={sourceId} onChange={event => {
            const next = sources.find(shift => shift.id === event.target.value);
            setTargetShift(null);
            setSourceId(event.target.value);
            setTargetDate(next?.date ?? '');
          }}>
            <option value="">Выберите смену</option>
            {sources.map(shift => <option key={shift.id} value={shift.id}>{shift.date} · {shift.startTime}–{shift.endTime}</option>)}
          </RequestSelect>
        </RequestField>
        <RequestField>Тип запроса
          <RequestSelect aria-label="Тип запроса" value={kind} onChange={event => setKind(event.target.value as ShiftChangeKind)}>
            <option value="COVER">Подмена</option>
            <option value="SWAP">Обмен сменами</option>
          </RequestSelect>
        </RequestField>
        <RequestField>Сотрудник
          <RequestSelect aria-label="Сотрудник" value={targetId} onChange={event => { setTargetShift(null); setTargetId(event.target.value); }}>
            <option value="">Выберите сотрудника</option>
            {targets.map(target => <option key={target.id} value={target.id}>{target.displayName}</option>)}
          </RequestSelect>
        </RequestField>
        {kind === 'SWAP' && <RequestField>Дата смены сотрудника
          <RequestInput aria-label="Дата смены сотрудника" type="date" value={targetDate} onChange={event => { setTargetShift(null); setTargetDate(event.target.value); }} />
        </RequestField>}
        {source && <RequestText>Вы отдаёте: {source.date} · {source.startTime}–{source.endTime}</RequestText>}
        {kind === 'SWAP' && targetShift && <RequestText>Вы получаете: {targetShift.date} · {targetShift.startTime}–{targetShift.endTime}</RequestText>}
        {kind === 'COVER' && targetId && <RequestText>Сотрудника просят принять вашу смену.</RequestText>}
        <RequestFeedback role="status" $error={!!feedback || !!lookupError}>{feedback || lookupError}</RequestFeedback>
        <RequestActions>
          <RequestButton type="button" disabled={busy || !source || !targetId || (kind === 'SWAP' && !targetShift)} onClick={() => void submit()}>Отправить запрос</RequestButton>
          {onClose && <RequestButton type="button" onClick={onClose}>Закрыть</RequestButton>}
        </RequestActions>
      </RequestGrid>
    </RequestPanel>
  );
}
