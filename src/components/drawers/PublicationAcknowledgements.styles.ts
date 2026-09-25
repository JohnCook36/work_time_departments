import styled from '@emotion/styled';

import { PublicationAcknowledgementList } from '../../api/planner';

type Status = PublicationAcknowledgementList['employees'][number]['status'];

export const AcknowledgementSummary = styled('p')(({ theme }) => ({
  minHeight: 28,
  margin: '6px 0',
  color: theme.colors.textMuted,
  fontSize: 12,
}));

export const AcknowledgementList = styled('div')({
  display: 'grid',
  gap: 8,
  maxHeight: 220,
  overflowY: 'auto',
  minWidth: 0,
});

export const AcknowledgementRow = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  padding: 8,
  minWidth: 0,
  border: '1px solid ' + theme.colors.border,
  borderRadius: 8,
  fontSize: 12,
  overflowWrap: 'anywhere',
}));

export const AcknowledgementPerson = styled('strong')({
  flex: '1 1 140px',
  minWidth: 0,
});

export const AcknowledgementStatus = styled('span')<{ $status: Status }>(
  ({ theme, $status }) => ({
    color: $status === 'ACKNOWLEDGED'
      ? theme.colors.success
      : $status === 'NOT_ACKNOWLEDGED'
        ? theme.colors.warning
        : theme.colors.textMuted,
    fontWeight: 700,
  }),
);
