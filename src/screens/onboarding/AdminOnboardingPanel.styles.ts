import styled from '@emotion/styled';
import { motion } from 'framer-motion';

export const AdminOverlay = styled(motion.div)(({ theme }) => ({
  position: 'fixed',
  inset: 0,
  zIndex: 12000,
  display: 'flex',
  justifyContent: 'flex-end',
  background: theme.colors.overlay,
}));

export const AdminDrawer = styled(motion.aside)(({ theme }) => ({
  width: 'min(520px, 100%)',
  height: '100%',
  overflowY: 'auto',
  padding: 20,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  borderLeft: '1px solid ' + theme.colors.border,
  boxShadow: theme.shadows.drawer,
}));

export const AdminHeader = styled('div')({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
});

export const AdminTitle = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontWeight: 800,
  fontSize: 18,
});

export const AdminDescription = styled('div')(({ theme }) => ({
  marginTop: 5,
  color: theme.colors.textMuted,
  fontSize: 13,
  lineHeight: 1.45,
}));

export const AdminControls = styled('div')({
  display: 'flex',
  gap: 8,
  marginTop: 18,
});

export const AdminDepartmentSelect = styled('select')(({ theme }) => ({
  flex: 1,
  minWidth: 0,
  height: 40,
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
  color: theme.colors.text,
  padding: '0 10px',
}));

export const AdminError = styled('div')(({ theme }) => ({
  marginTop: 12,
  padding: 10,
  borderRadius: 10,
  background: theme.colors.dangerSoft,
  color: theme.colors.danger,
  fontSize: 13,
}));

export const RequestsSection = styled('div')({
  marginTop: 16,
});

export const RequestsLoading = styled('div')(({ theme }) => ({
  padding: 20,
  textAlign: 'center',
  color: theme.colors.textMuted,
}));

export const RequestsEmpty = styled('div')(({ theme }) => ({
  padding: 22,
  borderRadius: 14,
  border: '1px dashed ' + theme.colors.border,
  textAlign: 'center',
  color: theme.colors.textMuted,
}));

export const RequestsList = styled('div')({
  display: 'grid',
  gap: 10,
});

export const RequestCard = styled(motion.div)(({ theme }) => ({
  padding: 14,
  borderRadius: 14,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
}));

export const RequestHeader = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
});

export const RequestBody = styled('div')({
  minWidth: 0,
});

export const RequestName = styled('div')({
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const RequestMeta = styled('div')(({ theme }) => ({
  marginTop: 4,
  color: theme.colors.textMuted,
  fontSize: 12,
}));

export const RequestTimestamp = styled('div')(({ theme }) => ({
  marginTop: 3,
  color: theme.colors.textMuted,
  fontSize: 11,
}));

export const RequestActions = styled('div')({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  marginTop: 12,
});

const requestActionBase = {
  minHeight: 38,
  borderRadius: 10,
  fontWeight: 800,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
} as const;

export const RejectButton = styled('button')(({ theme }) => ({
  ...requestActionBase,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.dangerSoft,
  color: theme.colors.danger,
  cursor: 'pointer',
  ':disabled': {
    cursor: 'wait',
  },
}));

export const ApproveButton = styled('button')(({ theme }) => ({
  ...requestActionBase,
  border: 0,
  background: theme.colors.primary,
  color: theme.colors.onPrimary,
  cursor: 'pointer',
  ':disabled': {
    cursor: 'wait',
  },
}));
