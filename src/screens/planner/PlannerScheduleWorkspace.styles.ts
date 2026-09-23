import styled from '@emotion/styled';

export const DayName = styled('div')({
  fontSize: 10,
  opacity: 0.68,
});

export const EmptyEmployees = styled('div')({
  padding: 28,
  textAlign: 'center',
});

const dragCardBase = (theme: any) => ({
  padding: '11px 14px',
  borderRadius: 12,
  border: '1px solid ' + theme.colors.primary,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  boxShadow: theme.shadows.dragOverlay,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
});

export const DragEmployeeCard = styled('div')(({ theme }) => ({
  ...dragCardBase(theme),
  minWidth: 260,
  maxWidth: 360,
}));

export const DragDepartmentCard = styled('div')(({ theme }) => ({
  ...dragCardBase(theme),
  minWidth: 250,
  fontWeight: 800,
}));

export const DragEmployeeBody = styled('div')({
  minWidth: 0,
});

export const DragEmployeeName = styled('div')({
  fontWeight: 800,
});

export const DragTargetText = styled('div')(({ theme }) => ({
  marginTop: 2,
  fontSize: 11,
  color: theme.colors.textMuted,
}));
