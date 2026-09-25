import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, getMySchedule, MyScheduleShift } from '../../api/auth';
import {
  getIncomingShiftChangeRequests, getMyShiftChangeRequests, getPendingShiftChangeRequests,
  respondToShiftChangeRequest, ShiftChangeRequest, shiftChangeKindLabel, shiftChangeStatusLabel,
} from '../../api/shiftChangeRequests';
import { hasManagementAccess, useAuthUser } from '../../auth/AuthContext';
import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import { EmptyState, SectionContainer, SectionHeader, SectionPage, SectionSubtitle, SectionTitle } from '../shared/SectionPage.styles';
import { eligibleSourceShifts, ShiftRequestComposer } from './ShiftRequestComposer';
import {
  RequestActions, RequestButton, RequestFeedback, RequestGrid, RequestHeading,
  RequestPanel, RequestRow, RequestText,
} from './ShiftRequestsScreen.styles';

type Action = 'accept' | 'reject' | 'cancel' | 'admin/approve' | 'admin/reject';

function describeShift(shift: ShiftChangeRequest['requesterShift']) {
  return shift.date.slice(0, 10) + ' · ' + (shift.startTime ?? '—') + '–' + (shift.endTime ?? '—');
}

function RequestList({ title, requests, role, busyId, onAction }: {
  title: string;
  requests: ShiftChangeRequest[];
  role: 'mine' | 'incoming' | 'manager';
  busyId: string | null;
  onAction: (id: string, action: Action) => void;
}) {
  return <RequestPanel aria-label={title}>
    <RequestHeading>{title}</RequestHeading>
    {requests.length === 0 ? <EmptyState>Пока нет запросов.</EmptyState> : <RequestGrid>
      {requests.map(request => <RequestRow key={request.id}>
        <strong>{shiftChangeKindLabel[request.kind]} · {shiftChangeStatusLabel[request.status]}</strong>
        <RequestText>{request.requesterEmployee.displayName} → {request.targetEmployee.displayName}</RequestText>
        <RequestText>{request.status === 'MANAGER_APPROVED' ? 'Смена в черновике' : 'Исходная смена'}: {describeShift(request.requesterShift)}</RequestText>
        {request.kind === 'SWAP' && request.targetShift && <RequestText>{request.status === 'MANAGER_APPROVED' ? 'Вторая смена в черновике' : 'Смена для обмена'}: {describeShift(request.targetShift)}</RequestText>}
        {role === 'incoming' && request.kind === 'COVER' && <RequestText>Вас просят принять эту смену.</RequestText>}
        {request.status === 'MANAGER_APPROVED' && <RequestText>Изменение применено в черновик. Официальный график обновится после публикации новой версии.</RequestText>}
        <RequestActions>
          {role === 'mine' && (request.status === 'PENDING_TARGET' || request.status === 'PENDING_MANAGER') &&
            <RequestButton type="button" disabled={busyId !== null} onClick={() => onAction(request.id, 'cancel')}>Отменить</RequestButton>}
          {role === 'incoming' && request.status === 'PENDING_TARGET' && <>
            <RequestButton type="button" disabled={busyId !== null} onClick={() => onAction(request.id, 'accept')}>Согласиться</RequestButton>
            <RequestButton type="button" disabled={busyId !== null} onClick={() => onAction(request.id, 'reject')}>Отказаться</RequestButton>
          </>}
          {role === 'manager' && request.status === 'PENDING_MANAGER' && <>
            <RequestButton type="button" disabled={busyId !== null} onClick={() => onAction(request.id, 'admin/approve')}>Одобрить</RequestButton>
            <RequestButton type="button" disabled={busyId !== null} onClick={() => onAction(request.id, 'admin/reject')}>Отклонить</RequestButton>
          </>}
        </RequestActions>
      </RequestRow>)}
    </RequestGrid>}
  </RequestPanel>;
}

export function ShiftRequestsScreen() {
  const user = useAuthUser();
  const canManage = hasManagementAccess(user);
  const [sources, setSources] = useState<MyScheduleShift[]>([]);
  const [mine, setMine] = useState<ShiftChangeRequest[]>([]);
  const [incoming, setIncoming] = useState<ShiftChangeRequest[]>([]);
  const [pending, setPending] = useState<ShiftChangeRequest[]>([]);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const now = new Date();
    const [schedule, owned, received, awaiting] = await Promise.all([
      getMySchedule(now.getFullYear(), now.getMonth() + 1),
      getMyShiftChangeRequests(), getIncomingShiftChangeRequests(),
      canManage ? getPendingShiftChangeRequests() : Promise.resolve([]),
    ]);
    setSources(eligibleSourceShifts(schedule.shifts, !!schedule.schedule));
    setMine(owned);
    setIncoming(received);
    setPending(awaiting);
  }, [canManage]);

  useEffect(() => {
    void refresh().catch(() => {
      setFeedbackError(true);
      setFeedback('Не удалось загрузить запросы. Обновите страницу.');
    });
  }, [refresh]);

  const action = async (id: string, kind: Action) => {
    setBusyId(id);
    setFeedback('');
    try {
      await respondToShiftChangeRequest(id, kind);
      setFeedbackError(false);
      setFeedback(kind === 'admin/approve'
        ? 'Изменение применено в черновик. Чтобы оно стало официальным для сотрудников, опубликуйте новую версию графика.'
        : 'Статус запроса обновлён.');
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error instanceof ApiError && error.status === 409
        ? 'Смена уже изменилась или запрос больше нельзя применить. Обновите данные.'
        : error instanceof Error ? error.message : 'Не удалось обработать запрос.');
    } finally {
      try { await refresh(); } catch { setFeedback('Не удалось обновить список. Обновите страницу.'); setFeedbackError(true); }
      setBusyId(null);
    }
  };

  return <SectionPage><SectionContainer>
    <SectionHeader>
      <SectionTitle>Обмен сменами</SectionTitle>
      <SectionSubtitle>Заявки на обмен и подмену смен. Изменения становятся официальными после публикации графика.</SectionSubtitle>
      <AppSectionNav />
    </SectionHeader>
    <RequestFeedback role={feedbackError ? 'alert' : 'status'} $error={feedbackError}>{feedback}</RequestFeedback>
    <RequestGrid>
      {sources.length > 0 ? <ShiftRequestComposer sources={sources} onCreated={async () => {
        await refresh(); setFeedbackError(false); setFeedback('Запрос отправлен сотруднику.');
      }} onConflict={refresh} /> : <RequestPanel aria-label="Новый запрос">
        <RequestHeading>Новый запрос</RequestHeading>
        <RequestText>Выберите опубликованную рабочую смену в разделе <Link to="/my-schedule">Мои смены</Link>.</RequestText>
      </RequestPanel>}
      <RequestList title="Мои запросы" requests={mine} role="mine" busyId={busyId} onAction={(id, kind) => void action(id, kind)} />
      <RequestList title="Входящие" requests={incoming} role="incoming" busyId={busyId} onAction={(id, kind) => void action(id, kind)} />
      {canManage && <RequestList title="На подтверждение" requests={pending} role="manager" busyId={busyId} onAction={(id, kind) => void action(id, kind)} />}
    </RequestGrid>
  </SectionContainer></SectionPage>;
}
