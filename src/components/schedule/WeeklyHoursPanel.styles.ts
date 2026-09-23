import styled from '@emotion/styled';

import { Card, Muted, Select, TinyText } from '../../theme/styles';

export const WeeklyHoursCard = styled(Card)({
  marginTop: 14,
  overflow: 'hidden',
});

export const WeeklyHoursHeader = styled('div')({
  padding: '14px 16px 8px',
});

export const WeeklyHoursDescription = styled(Muted)({
  marginTop: 4,
});

export const WeeklyHoursScroll = styled('div')({
  overflowX: 'auto',
  padding: '0 0 10px',
});

export const WeeklyHoursTable = styled('table')({
  width: 'max-content',
  minWidth: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
});

const headerCell = (theme: any) => ({
  padding: '9px 8px',
  background: theme.colors.department,
  borderTop: '1px solid ' + theme.colors.border,
  borderBottom: '1px solid ' + theme.colors.border,
  borderRight: '1px solid ' + theme.colors.border,
});

export const EmployeeHeaderCell = styled('th')(({ theme }) => ({
  ...headerCell(theme),
  position: 'sticky',
  left: 0,
  zIndex: 2,
  minWidth: 220,
  padding: '9px 12px',
  textAlign: 'left',
}));

export const RateHeaderCell = styled('th')(({ theme }) => ({
  ...headerCell(theme),
  minWidth: 84,
}));

export const WeekHeaderCell = styled('th')(({ theme }) => ({
  ...headerCell(theme),
  minWidth: 132,
}));

export const WeeklyRow = styled('tr')<{ $odd: boolean }>(({ theme, $odd }) => ({
  background: $odd ? theme.colors.rowOdd : theme.colors.surfaceElevated,
}));

export const EmployeeCell = styled('td')(({ theme }) => ({
  position: 'sticky',
  left: 0,
  zIndex: 1,
  minWidth: 220,
  maxWidth: 220,
  padding: '8px 12px',
  fontWeight: 700,
  background: 'inherit',
  borderBottom: '1px solid ' + theme.colors.border,
  borderRight: '1px solid ' + theme.colors.border,
  boxShadow: theme.shadows.sticky,
}));

export const RateCell = styled('td')(({ theme }) => ({
  padding: '6px 8px',
  textAlign: 'center',
  borderBottom: '1px solid ' + theme.colors.border,
  borderRight: '1px solid ' + theme.colors.border,
}));

export const RateSelect = styled(Select)({
  minWidth: 68,
  height: 30,
  padding: '0 7px',
  fontSize: 11,
});

export const WeekCell = styled('td')(({ theme }) => ({
  minWidth: 132,
  padding: '7px 9px',
  textAlign: 'center',
  borderBottom: '1px solid ' + theme.colors.border,
  borderRight: '1px solid ' + theme.colors.border,
}));

export const WeeklyFact = styled('div')({
  fontWeight: 800,
});

export const WeeklyHint = styled(TinyText)({
  marginTop: 2,
});

export const WeeklyDelta = styled('div')<{
  $tone: 'balanced' | 'positive' | 'negative';
}>(({ theme, $tone }) => ({
  marginTop: 4,
  fontSize: 11,
  fontWeight: 800,
  color:
    $tone === 'balanced'
      ? theme.colors.textMuted
      : $tone === 'positive'
        ? theme.colors.success
        : theme.colors.warning,
}));
