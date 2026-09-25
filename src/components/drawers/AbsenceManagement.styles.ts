import styled from '@emotion/styled';

import { ActionButton } from '../../theme/styles';

export const AbsencePanel = styled('div')({
  display: 'grid',
  gap: 10,
});

export const AbsenceGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  '@media (max-width: 520px)': {
    gridTemplateColumns: '1fr',
  },
});

export const AbsenceFeedback = styled('div')(({ theme }) => ({
  minHeight: 36,
  padding: '6px 8px',
  borderRadius: 8,
  color: theme.colors.textMuted,
  fontSize: 12,
  lineHeight: '18px',
}));

export const AbsenceList = styled('div')({
  display: 'grid',
  gap: 8,
  maxHeight: 260,
  overflowY: 'auto',
});

export const AbsenceItem = styled('div')(({ theme }) => ({
  display: 'grid',
  gap: 6,
  padding: 10,
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
}));

export const AbsenceMeta = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 11,
  lineHeight: '17px',
}));

export const AbsenceActions = styled('div')({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
});

export const AbsenceButton = styled(ActionButton)({
  minHeight: 34,
});

export const AbsenceStatus = styled('span')<{ $canceled?: boolean }>(
  ({ theme, $canceled }) => ({
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 20,
    padding: '1px 7px',
    borderRadius: 999,
    background: $canceled
      ? theme.colors.surfaceElevated
      : theme.colors.successSoft,
    color: $canceled ? theme.colors.textMuted : theme.colors.success,
    fontSize: 10,
    fontWeight: 800,
  }),
);
