import styled from '@emotion/styled';
import { motion } from 'framer-motion';

export const ScheduleOverlay = styled(motion.div)(({ theme }) => ({
  position: 'fixed',
  inset: 0,
  zIndex: 11900,
  display: 'flex',
  justifyContent: 'flex-end',
  background: theme.colors.overlay,
}));

export const ScheduleDrawer = styled(motion.aside)(({ theme }) => ({
  width: 'min(500px, 100%)',
  height: '100%',
  overflowY: 'auto',
  padding: 20,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  borderLeft: '1px solid ' + theme.colors.border,
  boxShadow: theme.shadows.drawer,
}));

export const ScheduleHeader = styled('div')({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
});

export const ScheduleTitle = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontWeight: 800,
  fontSize: 18,
});

export const SchedulePeriod = styled('div')(({ theme }) => ({
  marginTop: 5,
  color: theme.colors.textMuted,
  fontSize: 13,
}));

export const ScheduleHeaderActions = styled('div')({
  display: 'flex',
  gap: 8,
});

export const ScheduleError = styled('div')(({ theme }) => ({
  marginTop: 14,
  padding: 10,
  borderRadius: 10,
  background: theme.colors.dangerSoft,
  color: theme.colors.danger,
  fontSize: 13,
}));

export const ScheduleLoading = styled('div')(({ theme }) => ({
  padding: '28px 0',
  textAlign: 'center',
  color: theme.colors.textMuted,
}));

export const EmployeeSummary = styled('div')(({ theme }) => ({
  marginTop: 18,
  padding: 14,
  borderRadius: 14,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
}));

export const EmployeeName = styled('div')({
  fontWeight: 800,
});

export const EmployeeMeta = styled('div')(({ theme }) => ({
  marginTop: 4,
  color: theme.colors.textMuted,
  fontSize: 12,
}));

export const TotalsGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
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
  fontWeight: 800,
  fontSize: 16,
});

export const ShiftList = styled('div')({
  marginTop: 14,
  display: 'grid',
  gap: 8,
});

export const EmptySchedule = styled('div')(({ theme }) => ({
  padding: 22,
  borderRadius: 14,
  border: '1px dashed ' + theme.colors.border,
  textAlign: 'center',
  color: theme.colors.textMuted,
}));

export const ShiftRow = styled(motion.div)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '58px 1fr auto',
  gap: 10,
  alignItems: 'center',
  padding: 12,
  borderRadius: 12,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
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
}));

export const ScheduleFooterNote = styled('div')(({ theme }) => ({
  marginTop: 14,
  color: theme.colors.textMuted,
  fontSize: 11,
  lineHeight: 1.45,
}));
