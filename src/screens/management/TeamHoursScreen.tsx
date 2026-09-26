import { useEffect, useMemo, useState } from 'react';

import { getManagementHours, ManagementHoursResponse } from '../../api/management';
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
  FilterRow,
  FilterSelect,
  HoursTable,
  HoursTableShell,
  LoadingSlot,
  MetricCard,
  MetricLabel,
  MetricsGrid,
  MetricValue,
  StatusText,
} from './ManagementDashboard.styles';

function statusLabel(status: 'balanced' | 'over' | 'under') {
  if (status === 'balanced') return 'Норма';
  return status === 'over' ? 'Переработка по графику' : 'Недоработка по графику';
}

export function TeamHoursScreen() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [departmentId, setDepartmentId] = useState('');
  const [data, setData] = useState<ManagementHoursResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    void getManagementHours(year, month, departmentId || undefined)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((value: unknown) => {
        if (active) setError(value instanceof Error ? value.message : 'Не удалось загрузить аналитику часов.');
      });
    return () => {
      active = false;
    };
  }, [year, month, departmentId]);

  const totals = data?.departments.reduce(
    (acc, department) => ({
      planned: acc.planned + department.plannedHours,
      norm: acc.norm + department.normHours,
      outside: acc.outside + department.outsideNormCount,
    }),
    { planned: 0, norm: 0, outside: 0 },
  );

  return (
    <SectionPage>
      <SectionContainer>
        <SectionHeader>
          <SectionTitle>Часы команды</SectionTitle>
          <SectionSubtitle>
            Только часы по графику. Это не фактическая посещаемость и не табель.
          </SectionSubtitle>
          <AppSectionNav />
        </SectionHeader>

        <FilterRow>
          <FilterSelect value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {String(index + 1).padStart(2, '0')}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {[year - 1, year, year + 1].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">Все управляемые отделы</option>
            {data?.departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </FilterSelect>
        </FilterRow>

        {!data ? (
          <LoadingSlot>{error || 'Загружаю аналитику…'}</LoadingSlot>
        ) : (
          <>
            <MetricsGrid>
              <MetricCard>
                <MetricValue>{Math.round((totals?.planned ?? 0) * 100) / 100}</MetricValue>
                <MetricLabel>часов по графику</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricValue>{Math.round((totals?.norm ?? 0) * 100) / 100}</MetricValue>
                <MetricLabel>расчётная норма</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricValue>{totals?.outside ?? 0}</MetricValue>
                <MetricLabel>сотрудников вне нормы</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricValue>{data.employees.length}</MetricValue>
                <MetricLabel>сотрудников</MetricLabel>
              </MetricCard>
            </MetricsGrid>

            {!data.departmentNormConfigured && (
              <CardMeta>
                Отдельная норма отдела пока не настроена: сравнение выполняется
                с производственной нормой по ставке.
              </CardMeta>
            )}

            <HoursTableShell>
              <HoursTable>
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th>Ставка</th>
                    <th>Смен</th>
                    <th>День</th>
                    <th>Ночь</th>
                    <th>План</th>
                    <th>Норма</th>
                    <th>Δ</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((employee) => (
                    <tr key={employee.id}>
                      <td>{employee.displayName}</td>
                      <td>{employee.employmentRate}</td>
                      <td>{employee.shiftCount}</td>
                      <td>{employee.dayHours}</td>
                      <td>{employee.nightHours}</td>
                      <td>{employee.plannedHours}</td>
                      <td>{employee.comparisonNormHours}</td>
                      <td>{employee.deltaHours > 0 ? '+' : ''}{employee.deltaHours}</td>
                      <td>
                        <StatusText $status={employee.status}>
                          {statusLabel(employee.status)}
                        </StatusText>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </HoursTable>
            </HoursTableShell>
          </>
        )}
      </SectionContainer>
    </SectionPage>
  );
}
