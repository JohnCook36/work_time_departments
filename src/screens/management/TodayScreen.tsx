import { useEffect, useMemo, useState } from 'react';

import { getManagementToday, ManagementTodayResponse } from '../../api/management';
import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import {
  SectionContainer,
  SectionHeader,
  SectionPage,
  SectionSubtitle,
  SectionTitle,
} from '../shared/SectionPage.styles';
import {
  CardMeta,
  CardTitle,
  DashboardCard,
  DashboardGrid,
  ItemList,
  ItemRow,
  LoadingSlot,
  MetricCard,
  MetricLabel,
  MetricsGrid,
  MetricValue,
  QuickLink,
  QuickLinks,
} from './ManagementDashboard.styles';

function localDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function shiftLabel(start: string | null, end: string | null, code: string | null) {
  if (!start || !end) return code || 'Смена';
  return (code ? code + ' · ' : '') + start + '–' + end;
}

function attendanceLabel(
  attendance: ManagementTodayResponse['departments'][number]['plannedShifts'][number]['attendance'],
) {
  if (!attendance) return 'Явка недоступна';
  if (attendance.status === 'NO_MARK') return 'Нет отметки';
  if (attendance.status === 'IN_PROGRESS') {
    return attendance.latenessMinutes > 0
      ? 'На смене · опоздание ' + attendance.latenessMinutes + ' мин'
      : 'На смене';
  }
  if ((attendance.earlyLeaveMinutes ?? 0) > 0) {
    return 'Завершена · ранний уход ' + attendance.earlyLeaveMinutes + ' мин';
  }
  if ((attendance.overtimeMinutes ?? 0) > 0) {
    return 'Завершена · переработка ' + attendance.overtimeMinutes + ' мин';
  }
  if (attendance.latenessMinutes > 0) {
    return 'Завершена · опоздание ' + attendance.latenessMinutes + ' мин';
  }
  return 'Завершена по плану';
}

export function TodayScreen() {
  const date = useMemo(localDate, []);
  const [data, setData] = useState<ManagementTodayResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getManagementToday(date)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((value: unknown) => {
        if (active) setError(value instanceof Error ? value.message : 'Не удалось загрузить экран «Сегодня».');
      });
    return () => {
      active = false;
    };
  }, [date]);

  return (
    <SectionPage>
      <SectionContainer>
        <SectionHeader>
          <SectionTitle>Сегодня</SectionTitle>
          <SectionSubtitle>
            Операционная картина на {date}: опубликованный план, фактические
            отметки, отсутствия и запросы руководителю.
          </SectionSubtitle>
          <AppSectionNav />
        </SectionHeader>

        {!data ? (
          <LoadingSlot>{error || 'Загружаю данные…'}</LoadingSlot>
        ) : (
          <>
            <MetricsGrid>
              <MetricCard>
                <MetricValue>{data.totals.plannedShifts}</MetricValue>
                <MetricLabel>плановых смен</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricValue>{data.totals.activeAbsences}</MetricValue>
                <MetricLabel>отсутствий</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricValue>{data.totals.pendingRequests}</MetricValue>
                <MetricLabel>запросов руководителю</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricValue>{data.totals.unpublishedDepartments}</MetricValue>
                <MetricLabel>отделов без публикации</MetricLabel>
              </MetricCard>
              {data.attendanceAvailable && (
                <>
                  <MetricCard>
                    <MetricValue>{data.totals.checkedIn}</MetricValue>
                    <MetricLabel>отметились</MetricLabel>
                  </MetricCard>
                  <MetricCard>
                    <MetricValue>{data.totals.noMark}</MetricValue>
                    <MetricLabel>без отметки</MetricLabel>
                  </MetricCard>
                </>
              )}
            </MetricsGrid>

            <QuickLinks>
              <QuickLink to="/planner">Открыть планировщик</QuickLink>
              <QuickLink to="/team-hours">Часы команды</QuickLink>
              <QuickLink to="/plan-actual">План / факт</QuickLink>
              <QuickLink to="/shift-requests">Запросы на смены</QuickLink>
            </QuickLinks>

            <DashboardGrid>
              {data.departments.map((department) => (
                <DashboardCard key={department.id}>
                  <CardTitle>
                    {department.name} · рисков {department.riskCount}
                  </CardTitle>
                  <CardMeta>
                    {department.publication
                      ? 'Опубликована версия v' + department.publication.version
                      : 'Нет опубликованного графика на этот месяц'}
                  </CardMeta>

                  <strong>План</strong>
                  <ItemList>
                    {department.plannedShifts.length === 0 ? (
                      <CardMeta>Плановых смен на сегодня нет.</CardMeta>
                    ) : (
                      department.plannedShifts.map((shift) => (
                        <ItemRow key={shift.id}>
                          <strong>{shift.displayName}</strong>
                          <span>{shiftLabel(shift.startTime, shift.endTime, shift.code)}</span>
                          {data.attendanceAvailable && (
                            <span>{attendanceLabel(shift.attendance)}</span>
                          )}
                        </ItemRow>
                      ))
                    )}
                  </ItemList>

                  <strong>Отсутствия</strong>
                  <ItemList>
                    {department.absences.length === 0 ? (
                      <CardMeta>Активных отсутствий нет.</CardMeta>
                    ) : (
                      department.absences.map((absence) => (
                        <ItemRow key={absence.id}>
                          <strong>{absence.displayName}</strong>
                          <span>{absence.type} · {absence.startDate}–{absence.endDate}</span>
                        </ItemRow>
                      ))
                    )}
                  </ItemList>
                </DashboardCard>
              ))}

              <DashboardCard>
                <CardTitle>Запросы на замену / обмен</CardTitle>
                <ItemList>
                  {data.pendingRequests.length === 0 ? (
                    <CardMeta>Запросов, ожидающих руководителя, нет.</CardMeta>
                  ) : (
                    data.pendingRequests.map((request) => (
                      <ItemRow key={request.id}>
                        <strong>
                          {request.requesterDisplayName} → {request.targetDisplayName}
                        </strong>
                        <span>{request.kind} · {request.requesterShift.date}</span>
                      </ItemRow>
                    ))
                  )}
                </ItemList>
              </DashboardCard>
            </DashboardGrid>
          </>
        )}
      </SectionContainer>
    </SectionPage>
  );
}
