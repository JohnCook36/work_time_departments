import { useEffect, useState } from 'react';

import {
  getPublicationAcknowledgements,
  PublicationAcknowledgementList,
} from '../../api/planner';
import {
  AcknowledgementList,
  AcknowledgementPerson,
  AcknowledgementRow,
  AcknowledgementStatus,
  AcknowledgementSummary,
} from './PublicationAcknowledgements.styles';

const labels = {
  ACKNOWLEDGED: 'Ознакомлен',
  NOT_ACKNOWLEDGED: 'Не ознакомлен',
  NO_ACTIVE_ACCOUNT: 'Нет активного аккаунта',
} as const;

export function PublicationAcknowledgements({ publicationId }: { publicationId: string }) {
  const [data, setData] = useState<PublicationAcknowledgementList | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let current = true;
    setData(null);
    setError(false);

    void getPublicationAcknowledgements(publicationId)
      .then(result => {
        if (!current) return;
        if (result.publicationId !== publicationId) {
          setError(true);
          return;
        }
        setData(result);
      })
      .catch(() => {
        if (current) setError(true);
      });

    return () => {
      current = false;
    };
  }, [publicationId]);

  return (
    <section aria-label="Ознакомление сотрудников">
      <strong>Ознакомление сотрудников</strong>
      <AcknowledgementSummary role="status" aria-live="polite">
        {error
          ? 'Не удалось загрузить статусы. Попробуйте открыть версию ещё раз.'
          : !data
            ? 'Загружаю статусы…'
            : data.employees.length === 0
              ? 'В этой версии нет сотрудников.'
              : `Сотрудников: ${data.employees.length} · ознакомлены: ${data.employees.filter(employee => employee.status === 'ACKNOWLEDGED').length}`}
      </AcknowledgementSummary>
      {data && data.employees.length > 0 && (
        <AcknowledgementList>
          {data.employees.map(employee => (
            <AcknowledgementRow key={employee.employeeId}>
              <AcknowledgementPerson>{employee.displayName}</AcknowledgementPerson>
              <AcknowledgementStatus $status={employee.status}>
                {labels[employee.status]}
              </AcknowledgementStatus>
              {employee.acknowledgedAt && (
                <time dateTime={employee.acknowledgedAt}>
                  {new Intl.DateTimeFormat('ru-RU', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(employee.acknowledgedAt))}
                </time>
              )}
            </AcknowledgementRow>
          ))}
        </AcknowledgementList>
      )}
    </section>
  );
}
