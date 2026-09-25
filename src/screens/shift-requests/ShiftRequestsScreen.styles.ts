import styled from '@emotion/styled';
import { ActionButton, Card } from '../../theme/styles';

export const RequestPanel = styled(Card)({
  padding: 18,
  minWidth: 0,
});

export const RequestHeading = styled('h2')(({ theme }) => ({ margin: '0 0 12px', color: theme.colors.text, fontSize: 18 }));
export const RequestGrid = styled('div')({ display: 'grid', gap: 12 });
export const RequestRow = styled('article')(({ theme }) => ({
  padding: 12,
  border: '1px solid ' + theme.colors.border,
  borderRadius: 12,
  display: 'grid',
  gap: 8,
  minWidth: 0,
  overflowWrap: 'anywhere',
}));
export const RequestText = styled('p')(({ theme }) => ({ margin: 0, color: theme.colors.textMuted, fontSize: 13, lineHeight: 1.5 }));
export const RequestActions = styled('div')({ display: 'flex', flexWrap: 'wrap', gap: 8 });
export const RequestButton = styled(ActionButton)({ minHeight: 38 });
export const RequestField = styled('label')(({ theme }) => ({ display: 'grid', gap: 5, color: theme.colors.text, fontSize: 13, fontWeight: 700 }));
export const RequestInput = styled('input')(({ theme }) => ({
  width: '100%', minWidth: 0, minHeight: 40, padding: '8px 10px',
  background: theme.colors.surfaceElevated, color: theme.colors.text,
  border: '1px solid ' + theme.colors.border, borderRadius: 10,
}));
export const RequestSelect = styled('select')(({ theme }) => ({
  width: '100%', minWidth: 0, minHeight: 40, padding: '8px 10px',
  background: theme.colors.surfaceElevated, color: theme.colors.text,
  border: '1px solid ' + theme.colors.border, borderRadius: 10,
}));
export const RequestFeedback = styled('div')<{ $error?: boolean }>(({ theme, $error }) => ({
  height: 64, overflowY: 'auto', padding: '8px 0', color: $error ? theme.colors.danger : theme.colors.textMuted,
  fontSize: 13, lineHeight: 1.35,
}));
export const RequestOverlay = styled('div')(({ theme }) => ({
  position: 'fixed', inset: 0, zIndex: 1000, background: theme.colors.overlay,
  display: 'flex', justifyContent: 'flex-end',
  '@media (max-width: 760px)': { alignItems: 'flex-end' },
}));
export const RequestDrawer = styled('aside')(({ theme }) => ({
  width: 'min(440px, 100vw)', height: '100%', overflowY: 'auto',
  padding: 20, background: theme.colors.surfaceElevated, color: theme.colors.text,
  boxShadow: theme.shadows.drawer,
  '@media (max-width: 760px)': { width: '100%', height: 'min(88vh, 760px)', padding: 16, borderRadius: '18px 18px 0 0' },
}));
