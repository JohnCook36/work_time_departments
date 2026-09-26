import styled from '@emotion/styled';
import { Link } from 'react-router-dom';

import { Card } from '../../theme/styles';

export const MetricsGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 10,
  marginBottom: 14,
  '@media (max-width: 760px)': {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
});

export const MetricCard = styled(Card)({
  minHeight: 92,
  padding: 14,
  display: 'grid',
  alignContent: 'center',
  gap: 4,
});

export const MetricValue = styled('strong')(({ theme }) => ({
  color: theme.colors.text,
  fontSize: 24,
  lineHeight: 1,
}));

export const MetricLabel = styled('span')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 11,
  fontWeight: 700,
}));

export const DashboardGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
  '@media (max-width: 760px)': {
    gridTemplateColumns: '1fr',
  },
});

export const DashboardCard = styled(Card)({
  minHeight: 180,
  padding: 16,
  display: 'grid',
  alignContent: 'start',
  gap: 10,
});

export const CardTitle = styled('h2')(({ theme }) => ({
  margin: 0,
  color: theme.colors.text,
  fontSize: 16,
}));

export const CardMeta = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
}));

export const ItemList = styled('div')({
  display: 'grid',
  gap: 7,
});

export const ItemRow = styled('div')(({ theme }) => ({
  padding: 9,
  borderRadius: 9,
  border: '1px solid ' + theme.colors.border,
  display: 'grid',
  gap: 3,
  color: theme.colors.text,
  fontSize: 12,
}));

export const QuickLinks = styled('div')({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
});

export const QuickLink = styled(Link)(({ theme }) => ({
  minHeight: 38,
  padding: '0 12px',
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
  color: theme.colors.text,
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 800,
  background: theme.colors.surfaceElevated,
}));

export const FilterRow = styled('div')({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginBottom: 12,
  '& > *': { minWidth: 0 },
  '@media (max-width: 620px)': {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
  },
});

export const NormFilterRow = styled(FilterRow)({
  '@media (max-width: 620px)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

export const FilterSelect = styled('select')(({ theme }) => ({
  minHeight: 40,
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  padding: '0 10px',
}));

export const HoursTableShell = styled(Card)({
  overflowX: 'auto',
});

export const HoursTable = styled('table')(({ theme }) => ({
  width: '100%',
  minWidth: 760,
  borderCollapse: 'collapse',
  color: theme.colors.text,
  fontSize: 12,
  '& th, & td': {
    padding: '9px 10px',
    borderBottom: '1px solid ' + theme.colors.border,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  '& th:first-of-type, & td:first-of-type': {
    textAlign: 'left',
  },
}));

export const StatusText = styled('strong')<{
  $status: 'balanced' | 'over' | 'under';
}>(({ theme, $status }) => ({
  color:
    $status === 'balanced'
      ? theme.colors.success
      : $status === 'over'
        ? theme.colors.warning
        : theme.colors.danger,
}));

export const LoadingSlot = styled('div')(({ theme }) => ({
  minHeight: 260,
  display: 'grid',
  placeItems: 'center',
  color: theme.colors.textMuted,
  fontSize: 13,
}));
