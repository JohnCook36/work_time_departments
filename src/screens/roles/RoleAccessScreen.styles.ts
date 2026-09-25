import styled from '@emotion/styled';

export const RoleToolbar = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 12,
  '@media (max-width: 720px)': {
    gridTemplateColumns: '1fr',
  },
});

export const RoleField = styled('label')(({ theme }) => ({
  display: 'grid',
  gap: 6,
  color: theme.colors.textMuted,
  fontSize: 12,
  fontWeight: 800,
}));

const fieldStyles = (theme: any) => ({
  minHeight: 40,
  width: '100%',
  border: '1px solid ' + theme.colors.border,
  borderRadius: 10,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  padding: '0 12px',
  outline: 'none',
  fontSize: 14,
  ':focus': {
    borderColor: theme.colors.primary,
    boxShadow: '0 0 0 3px ' + theme.colors.focusRing,
  },
});

export const RoleSelect = styled('select')(({ theme }) => fieldStyles(theme));

export const RoleInput = styled('input')(({ theme }) => fieldStyles(theme));

export const RoleActions = styled('div')({
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  alignItems: 'center',
});

export const RoleButton = styled('button')<{
  $variant?: 'primary' | 'danger' | 'secondary';
}>(({ theme, $variant = 'secondary' }) => {
  const palette = {
    primary: {
      bg: theme.colors.primary,
      color: theme.colors.onPrimary,
      border: theme.colors.primary,
    },
    danger: {
      bg: theme.colors.dangerSoft,
      color: theme.colors.danger,
      border: theme.colors.dangerSoft,
    },
    secondary: {
      bg: theme.colors.surfaceElevated,
      color: theme.colors.text,
      border: theme.colors.border,
    },
  }[$variant];

  return {
    minHeight: 38,
    borderRadius: 10,
    border: '1px solid ' + palette.border,
    background: palette.bg,
    color: palette.color,
    padding: '0 12px',
    fontWeight: 800,
    fontSize: 12,
    cursor: 'pointer',
    ':disabled': {
      cursor: 'not-allowed',
      opacity: 0.55,
    },
  };
});

export const RoleFeedback = styled('div')<{ $error?: boolean }>(
  ({ theme, $error }) => ({
    minHeight: 24,
    marginTop: 10,
    color: $error ? theme.colors.danger : theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 1.5,
  }),
);

export const AssignmentList = styled('div')({
  display: 'grid',
  gap: 10,
});

export const AssignmentCard = styled('article')(({ theme }) => ({
  display: 'grid',
  gap: 10,
  padding: 14,
  border: '1px solid ' + theme.colors.border,
  borderRadius: 12,
  background: theme.colors.surfaceElevated,
}));

export const AssignmentTop = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
});

export const AssignmentTitle = styled('div')(({ theme }) => ({
  color: theme.colors.text,
  fontWeight: 800,
  fontSize: 14,
}));

export const AssignmentMeta = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
}));

export const CapabilityGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
  '@media (max-width: 620px)': {
    gridTemplateColumns: '1fr',
  },
});

export const CapabilityCheck = styled('label')(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: 8,
  borderRadius: 9,
  border: '1px solid ' + theme.colors.border,
  color: theme.colors.text,
  fontSize: 12,
  lineHeight: 1.35,
}));

export const SectionHeading = styled('h2')(({ theme }) => ({
  margin: '0 0 12px',
  color: theme.colors.text,
  fontSize: 16,
}));

export const InlineHint = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 11,
  lineHeight: 1.45,
}));
