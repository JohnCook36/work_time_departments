import styled from '@emotion/styled';
import { Link } from 'react-router-dom';

import {
  ActionButton,
  Card,
  HeaderCard,
  IconButton,
  Muted,
} from '../../theme/styles';

export const SchedulePageHeader = styled(HeaderCard)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
});

export const SchedulePageHeading = styled('div')({
  minWidth: 0,
});

export const SchedulePageTitle = styled('h1')(({ theme }) => ({
  margin: 0,
  color: theme.colors.text,
  fontSize: 24,
  lineHeight: 1.2,
  fontWeight: 800,
}));

export const SchedulePageSubtitle = styled(Muted)({
  marginTop: 5,
});

export const ScheduleHeaderActions = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
});

export const ScheduleRouteLink = styled(Link)(({ theme }) => ({
  minHeight: 38,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  fontWeight: 700,
  fontSize: 13,
  textDecoration: 'none',
  ':hover': {
    borderColor: theme.colors.primary,
    color: theme.colors.primary,
  },
}));

export const ThemeToggleButton = styled(IconButton)({
  flex: '0 0 auto',
});

export const ScheduleCard = styled(Card)({
  padding: 18,
});

export const PeriodNavigation = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 16,
});

export const PeriodLabel = styled('div')(({ theme }) => ({
  flex: 1,
  textAlign: 'center',
  color: theme.colors.text,
  fontSize: 18,
  fontWeight: 800,
}));

export const ScheduleError = styled('div')(({ theme }) => ({
  padding: 12,
  borderRadius: 10,
  background: theme.colors.dangerSoft,
  color: theme.colors.danger,
  fontSize: 13,
}));

export const ScheduleLoading = styled('div')(({ theme }) => ({
  padding: '34px 0',
  textAlign: 'center',
  color: theme.colors.textMuted,
}));

export const EmployeeSummary = styled('section')(({ theme }) => ({
  padding: 14,
  borderRadius: 14,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
}));

export const EmployeeName = styled('div')({
  fontWeight: 800,
  fontSize: 16,
});

export const EmployeeMeta = styled('div')(({ theme }) => ({
  marginTop: 4,
  color: theme.colors.textMuted,
  fontSize: 12,
}));

export const TotalsGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
  marginTop: 12,
  '@media (max-width: 520px)': {
    gridTemplateColumns: '1fr',
  },
});

export const TotalCard = styled('div')(({ theme }) => ({
  padding: 10,
  borderRadius: 10,
  background: theme.colors.offSoft,
  textAlign: 'center',
}));

export const TotalLabel = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 11,
}));

export const TotalValue = styled('div')({
  marginTop: 3,
  fontWeight: 800,
  fontSize: 16,
});

export const ShiftList = styled('div')({
  marginTop: 14,
  display: 'grid',
  gap: 8,
});

export const EmptySchedule = styled('div')(({ theme }) => ({
  padding: 24,
  borderRadius: 14,
  border: '1px dashed ' + theme.colors.border,
  textAlign: 'center',
  color: theme.colors.textMuted,
}));

export const ShiftRow = styled('article')(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '58px minmax(0, 1fr) auto',
  gap: 10,
  alignItems: 'center',
  padding: 12,
  borderRadius: 12,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
  '@media (max-width: 520px)': {
    gridTemplateColumns: '50px minmax(0, 1fr)',
  },
}));

export const ShiftDate = styled('div')({
  textAlign: 'center',
  lineHeight: 1.1,
});

export const ShiftDayNumber = styled('div')({
  fontSize: 18,
  fontWeight: 900,
});

export const ShiftDayName = styled('div')(({ theme }) => ({
  marginTop: 3,
  color: theme.colors.textMuted,
  fontSize: 11,
}));

export const ShiftBody = styled('div')({
  minWidth: 0,
});

export const ShiftTitle = styled('div')({
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const InheritedLabel = styled('span')(({ theme }) => ({
  marginLeft: 7,
  color: theme.colors.textMuted,
  fontSize: 10,
  fontWeight: 700,
}));

export const ShiftMeta = styled('div')(({ theme }) => ({
  marginTop: 3,
  color: theme.colors.textMuted,
  fontSize: 11,
}));

export const ShiftHours = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  color: theme.colors.textMuted,
  fontSize: 12,
  fontWeight: 700,
  '@media (max-width: 520px)': {
    gridColumn: '2',
    justifySelf: 'start',
  },
}));

export const ScheduleFooterNote = styled('div')(({ theme }) => ({
  marginTop: 14,
  color: theme.colors.textMuted,
  fontSize: 11,
  lineHeight: 1.45,
}));

export const LogoutButton = styled(ActionButton)({
  minHeight: 38,
});
