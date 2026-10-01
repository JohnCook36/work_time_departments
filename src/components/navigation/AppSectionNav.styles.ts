import styled from '@emotion/styled';
import { NavLink } from 'react-router-dom';

export const MenuButtonRow = styled('div')(() => ({
  display: 'flex',
  justifyContent: 'flex-end',
}));

export const MenuButton = styled('button')(({ theme }) => ({
  minHeight: 42,
  padding: '0 14px',
  borderRadius: 12,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
  color: theme.colors.text,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
  ':hover': {
    color: theme.colors.primary,
    background: theme.colors.totalSoft,
  },
  ':focus-visible': {
    outline: '2px solid ' + theme.colors.focusRing,
    outlineOffset: 2,
  },
}));

export const DrawerBackdrop = styled('button')(({ theme }) => ({
  position: 'fixed',
  inset: 0,
  zIndex: 980,
  border: 0,
  padding: 0,
  background: theme.colors.overlay,
  cursor: 'default',
}));

export const DrawerPanel = styled('nav')(({ theme }) => ({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: 990,
  width: 'min(360px, calc(100vw - 24px))',
  padding: 18,
  overflowY: 'auto',
  background: theme.colors.surface,
  borderLeft: '1px solid ' + theme.colors.border,
  boxShadow: theme.shadows.drawerMobile,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  '@media (max-width: 720px)': {
    width: 'min(340px, calc(100vw - 16px))',
    padding: 14,
  },
}));

export const DrawerHeader = styled('div')(({ theme }) => ({
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  paddingBottom: 12,
  borderBottom: '1px solid ' + theme.colors.border,
}));

export const DrawerTitle = styled('div')(({ theme }) => ({
  color: theme.colors.text,
  fontSize: 18,
  fontWeight: 900,
}));

export const DrawerCloseButton = styled('button')(({ theme }) => ({
  width: 40,
  height: 40,
  flex: '0 0 auto',
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
  color: theme.colors.textMuted,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  ':hover': {
    color: theme.colors.primary,
    background: theme.colors.totalSoft,
  },
  ':focus-visible': {
    outline: '2px solid ' + theme.colors.focusRing,
    outlineOffset: 2,
  },
}));

export const DrawerGroup = styled('section')(() => ({
  display: 'grid',
  gap: 6,
}));

export const DrawerGroupLabel = styled('div')(({ theme }) => ({
  padding: '0 10px 4px',
  color: theme.colors.textMuted,
  fontSize: 11,
  lineHeight: 1.2,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}));

export const DrawerLink = styled(NavLink)(({ theme }) => ({
  minHeight: 46,
  padding: '0 12px',
  borderRadius: 11,
  border: '1px solid transparent',
  color: theme.colors.text,
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 14,
  fontWeight: 800,
  transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
  '&.active': {
    color: theme.colors.primary,
    background: theme.colors.totalSoft,
    borderColor: theme.colors.border,
  },
  ':hover': {
    color: theme.colors.primary,
    background: theme.colors.totalSoft,
  },
  ':focus-visible': {
    outline: '2px solid ' + theme.colors.focusRing,
    outlineOffset: 2,
  },
}));
