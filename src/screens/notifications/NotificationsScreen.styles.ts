import styled from '@emotion/styled';

export const InboxHeaderRow = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
});

export const InboxButton = styled('button')(({ theme }) => ({
  minHeight: 38,
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  padding: '0 12px',
  fontWeight: 800,
  cursor: 'pointer',
  ':disabled': { opacity: 0.55, cursor: 'not-allowed' },
}));

export const InboxList = styled('div')({
  display: 'grid',
  gap: 10,
});

export const InboxItem = styled('button')<{ $unread: boolean }>(({ theme, $unread }) => ({
  width: '100%',
  textAlign: 'left',
  borderRadius: 12,
  border: '1px solid ' + theme.colors.border,
  background: $unread ? theme.colors.surfaceElevated : theme.colors.surface,
  color: theme.colors.text,
  padding: 14,
  display: 'grid',
  gap: 6,
  cursor: 'pointer',
}));

export const InboxMeta = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 12,
}));

export const PreferenceRow = styled('label')(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid ' + theme.colors.border,
  ':last-of-type': { borderBottom: 0 },
}));
