import styled from '@emotion/styled';

import { Select, TextInput } from '../../theme/styles';

export const FixedTimeInput = styled(TextInput)({
  width: '100%',
});

export const HiddenFileInput = styled('input')({
  display: 'none',
});

export const PrintRangeSelect = styled(Select)({
  width: '100%',
});

export const ToolbarActions = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  width: '100%',
});

export const DrawerForm = styled('form')({
  display: 'grid',
  gap: 14,
});

export const DrawerField = styled('div')({
  display: 'grid',
  gap: 6,
});

export const DrawerFieldLabel = styled('label')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 12,
  fontWeight: 700,
}));

export const EmployeeNameInput = styled(TextInput)({
  width: '100%',
  minWidth: 0,
});

export const ValidationSlot = styled('div')(({ theme }) => ({
  minHeight: 16,
  color: theme.colors.danger,
  fontSize: 11,
  lineHeight: '16px',
}));

export const DrawerActions = styled('div')({
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginTop: 4,
});

export const ToolsSection = styled('section')(({ theme }) => ({
  display: 'grid',
  gap: 10,
  padding: 12,
  border: '1px solid ' + theme.colors.border,
  borderRadius: 12,
  background: theme.colors.surface,
}));

export const ToolsSectionTitle = styled('div')(({ theme }) => ({
  color: theme.colors.text,
  fontSize: 13,
  fontWeight: 800,
}));

export const ToolsGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  '@media (max-width: 520px)': {
    gridTemplateColumns: '1fr',
  },
});
