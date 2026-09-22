import styled from '@emotion/styled';

import { ActionButton, Card, IconButton, Page } from '../../theme/styles';

export const MySchedulePageShell = styled(Page)({
  display: 'grid',
  placeItems: 'start center',
});

export const MyScheduleContent = styled('main')({
  width: 'min(920px, 100%)',
});

export const MyScheduleHeaderCard = styled(Card)({
  padding: 18,
  display: 'grid',
  gap: 14,
});

export const MyScheduleTopRow = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
});

export const MyScheduleTitleBlock = styled('div')({
  minWidth: 0,
});

export const MyScheduleTitle = styled('h1')(({ theme }) => ({
  margin: 0,
  color: theme.colors.text,
  fontSize: 24,
  lineHeight: 1.2,
  '@media (max-width: 720px)': {
    fontSize: 20,
  },
}));

export const MyScheduleSubtitle = styled('p')(({ theme }) => ({
  margin: '5px 0 0',
  color: theme.colors.textMuted,
  fontSize: 13,
}));

export const MyScheduleHeaderActions = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const MonthControls = styled('div')({
  display: 'grid',
  gridTemplateColumns: '38px minmax(150px, 1fr) 38px',
  alignItems: 'center',
  gap: 8,
  width: 'min(360px, 100%)',
});

export const MonthControlButton = styled(IconButton)({});

export const MonthLabel = styled('div')(({ theme }) => ({
  minHeight: 38,
  display: 'grid',
  placeItems: 'center',
  color: theme.colors.text,
  fontWeight: 800,
  fontSize: 15,
}));

export const RefreshButton = styled(ActionButton)({});

export const ScheduleSection = styled(Card)({
  marginTop: 16,
  padding: 18,
});

export const SectionLoading = styled('div')(({ theme }) => ({
  padding: '32px 0',
  textAlign: 'center',
  color: theme.colors.textMuted,
}));

export const SectionError = styled('div')(({ theme }) => ({
  padding: 12,
  borderRadius: 12,
  background: theme.colors.dangerSoft,
  color: theme.colors.danger,
  fontSize: 13,
}));

export const EmployeeSummary = styled('div')(({ theme }) => ({
  padding: 14,
  borderRadius: 14,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
}));

export const EmployeeName = styled('div')({
  fontWeight: 900,
  fontSize: 18,
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
  fontWeight: 900,
  fontSize: 16,
});

export const ShiftList = styled('div')({
  marginTop: 14,
  display: 'grid',
  gap: 8,
});

export const ShiftRow = styled('article')(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '58px 1fr auto',
  gap: 10,
  alignItems: 'center',
  padding: 12,
  borderRadius: 12,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
  '@media (max-width: 560px)': {
    gridTemplateColumns: '52px 1fr',
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
});

export const ShiftMeta = styled('div')(({ theme }) => ({
  marginTop: 3,
  color: theme.colors.textMuted,
  fontSize: 11,
}));

export const InheritedLabel = styled('span')(({ theme }) => ({
  marginLeft: 7,
  color: theme.colors.textMuted,
  fontSize: 10,
  fontWeight: 700,
}));

export const ShiftHours = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  color: theme.colors.textMuted,
  fontSize: 12,
  fontWeight: 700,
  '@media (max-width: 560px)': {
    gridColumn: '2',
    justifySelf: 'start',
  },
}));

export const EmptySchedule = styled('div')(({ theme }) => ({
  padding: 24,
  borderRadius: 14,
  border: '1px dashed ' + theme.colors.border,
  textAlign: 'center',
  color: theme.colors.textMuted,
}));

export const ScheduleFooter = styled('div')(({ theme }) => ({
  marginTop: 14,
  color: theme.colors.textMuted,
  fontSize: 11,
  lineHeight: 1.45,
}));
