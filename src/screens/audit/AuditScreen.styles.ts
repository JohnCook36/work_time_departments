import styled from '@emotion/styled';

import { ActionButton, Select, TextInput } from '../../theme/styles';

export const AuditFiltersGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
  '@media (max-width: 640px)': {
    gridTemplateColumns: '1fr',
  },
});

export const AuditField = styled('label')(({ theme }) => ({
  display: 'grid',
  gap: 5,
  color: theme.colors.text,
  fontSize: 12,
  fontWeight: 800,
}));

export const AuditSelect = styled(Select)({
  width: '100%',
  minWidth: 0,
});

export const AuditInput = styled(TextInput)({
  width: '100%',
  minWidth: 0,
});

export const AuditActions = styled('div')({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
});

export const AuditActionButton = styled(ActionButton)({
  minHeight: 40,
});

export const AuditFeedback = styled('div')<{ $error?: boolean }>(
  ({ theme, $error }) => ({
    minHeight: 38,
    padding: '8px 0',
    color: $error ? theme.colors.danger : theme.colors.textMuted,
    fontSize: 13,
    lineHeight: '20px',
  }),
);

export const AuditList = styled('div')({
  display: 'grid',
  gap: 10,
});

export const AuditItem = styled('article')(({ theme }) => ({
  display: 'grid',
  gap: 6,
  padding: 12,
  borderRadius: 12,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surfaceElevated,
  minWidth: 0,
}));

export const AuditItemTitle = styled('div')(({ theme }) => ({
  color: theme.colors.text,
  fontSize: 14,
  fontWeight: 800,
  overflowWrap: 'anywhere',
}));

export const AuditMeta = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
}));

export const AuditPager = styled('div')({
  display: 'flex',
  justifyContent: 'center',
  paddingTop: 12,
});
