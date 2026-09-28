import { useEffect, useMemo, useState } from 'react';

import {
  getManagementHours,
  ManagementHoursResponse,
  setDepartmentHoursNorm,
} from '../../api/management';
import { AppSectionNav } from '../../components/navigation/AppSectionNav';
import {
  SectionContainer,
  SectionHeader,
  SectionPage,
  SectionSubtitle,
  SectionTitle,
} from '../shared/SectionPage.styles';
import { ActionButton, TextInput } from '../../theme/styles';
import {
  CardMeta,
  FilterRow,
  NormFilterRow,
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
  const [normHours, setNormHours] = useState('');
  const [savingNorm, setSavingNorm] = useState(false);
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
      norm: acc.norm + department.comparisonNormHours,
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

        {data && departmentId && (
          <NormFilterRow>
            <TextInput
              aria-label="Норма отдела на полную ставку"
              type="number"
              min="0"
              max="400"
              step="0.5"
              value={normHours}
              placeholder={
                data.departments[0]?.departmentNormHours !== null &&
                data.departments[0]?.employeeCount > 0
                  ? 'Норма отдела настроена'
                  : 'Норма отдела, ч'
              }
              onChange={(event) => setNormHours(event.target.value)}
            />
            <ActionButton
              type="button"
              disabled={
                savingNorm ||
                normHours.trim() === '' ||
                !Number.isFinite(Number(normHours))
              }
              onClick={() => {
                const value = Number(normHours);
                if (!Number.isFinite(value)) return;
                setSavingNorm(true);
                setError('');
                void setDepartmentHoursNorm(
                  departmentId,
                  year,
                  month,
                  value,
                )
                  .then(() =>
                    getManagementHours(year, month, departmentId),
                  )
                  .then((result) => {
                    setData(result);
                    setNormHours('');
                  })
                  .catch((value: unknown) => {
                    setError(
                      value instanceof Error
                        ? value.message
                        : 'Не удалось сохранить норму отдела.',
                    );
                  })
                  .finally(() => setSavingNorm(false));
              }}
            >
              {savingNorm ? 'Сохраняю…' : 'Сохранить норму отдела'}
            </ActionButton>
          </NormFilterRow>
        )}

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

            {!data.departmentNormConfigured ? (
              <CardMeta>
                Отдельная норма отдела пока не настроена: сравнение выполняется
                с производственной нормой по ставке.
              </CardMeta>
            ) : (
              <CardMeta>
                Для настроенных отделов сравнение идёт с нормой отдела;
                производственная норма всё равно показывается отдельно.
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
                    <th>Производственная</th>
                    <th>Норма отдела</th>
                    <th>Для сравнения</th>
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
                      <td>{employee.productionNormHours}</td>
                      <td>{employee.departmentNormHours ?? '—'}</td>
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
