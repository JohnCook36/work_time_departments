import { useEffect, useMemo, useState } from 'react';
import { getManagementPlanActual, ManagementPlanActualResponse } from '../../api/planActual';
import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import { SectionContainer, SectionHeader, SectionPage, SectionSubtitle, SectionTitle } from '../shared/SectionPage.styles';
import { FilterRow, FilterSelect, HoursTable, HoursTableShell, LoadingSlot } from './ManagementDashboard.styles';

function label(row: ManagementPlanActualResponse['rows'][number]) {
  if (row.status === 'NO_MARK') return 'Нет отметки';
  if (row.status === 'IN_PROGRESS') return 'На смене';
  if ((row.earlyLeaveMinutes ?? 0) > 0) return 'Ранний уход';
  if ((row.overtimeMinutes ?? 0) > 0) return 'Переработка';
  if (row.latenessMinutes > 0) return 'Опоздание';
  return 'По плану';
}

export function PlanActualScreen() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ManagementPlanActualResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getManagementPlanActual(year, month)
      .then(value => active && setData(value))
      .catch((value: unknown) => active && setError(value instanceof Error ? value.message : 'Не удалось загрузить план/факт.'));
    return () => { active = false; };
  }, [year, month]);

  return (
    <SectionPage><SectionContainer>
      <SectionHeader>
        <SectionTitle>План / факт</SectionTitle>
        <SectionSubtitle>План — опубликованный график, факт — WorkSession. Оплачиваемое время пока не рассчитывается.</SectionSubtitle>
        <AppSectionNav />
      </SectionHeader>
      <FilterRow>
        <FilterSelect value={month} onChange={event => setMonth(Number(event.target.value))}>
          {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{String(index + 1).padStart(2, '0')}</option>)}
        </FilterSelect>
        <FilterSelect value={year} onChange={event => setYear(Number(event.target.value))}>
          {[year - 1, year, year + 1].map(value => <option key={value} value={value}>{value}</option>)}
        </FilterSelect>
      </FilterRow>
      {!data ? <LoadingSlot>{error || 'Загружаю план/факт…'}</LoadingSlot> : (
        <HoursTableShell><HoursTable>
          <thead><tr><th>Сотрудник</th><th>Дата</th><th>План</th><th>Факт, мин</th><th>Δ</th><th>Статус</th></tr></thead>
          <tbody>{data.rows.map(row => (
            <tr key={row.publicationId + ':' + row.shiftId}>
              <td>{row.displayName}</td><td>{row.date}</td><td>{row.startTime}–{row.endTime}</td>
              <td>{row.actualMinutes ?? '—'}</td><td>{row.deltaMinutes ?? '—'}</td><td>{label(row)}</td>
            </tr>
          ))}</tbody>
        </HoursTable></HoursTableShell>
      )}
    </SectionContainer></SectionPage>
  );
}
