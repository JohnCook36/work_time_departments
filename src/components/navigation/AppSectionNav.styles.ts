import styled from '@emotion/styled';
import { NavLink } from 'react-router-dom';

export const NavigationBar = styled('nav')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  padding: 10,
  borderRadius: 14,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
  '@media (max-width: 720px)': {
    display: 'none',
  },
}));

export const NavigationLink = styled(NavLink)(({ theme }) => ({
  minHeight: 36,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '0 11px',
  borderRadius: 10,
  border: '1px solid transparent',
  color: theme.colors.textMuted,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 800,
  transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
  '&.active': {
    color: theme.colors.primary,
    background: theme.colors.totalSoft,
    borderColor: theme.colors.border,
  },
  ':hover': {
    color: theme.colors.primary,
    borderColor: theme.colors.border,
  },
}));

export const MobileNavigationBar = styled('nav')(({ theme }) => ({
  display: 'none',
  '@media (max-width: 720px)': {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1200,
    minHeight: 'calc(64px + env(safe-area-inset-bottom))',
    padding:
      '6px 8px calc(6px + env(safe-area-inset-bottom))',
    borderTop: '1px solid ' + theme.colors.border,
    background: theme.colors.surface,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    display: 'grid',
    alignItems: 'stretch',
  },
}));

export const MobileNavigationLink = styled(NavLink)(({ theme }) => ({
  minWidth: 0,
  minHeight: 52,
  padding: '5px 4px',
  borderRadius: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  color: theme.colors.textMuted,
  textDecoration: 'none',
  fontSize: 10,
  lineHeight: 1.15,
  fontWeight: 800,
  textAlign: 'center',
  '&.active': {
    color: theme.colors.primary,
    background: theme.colors.totalSoft,
  },
  ':focus-visible': {
    outline: '2px solid ' + theme.colors.focusRing,
    outlineOffset: -2,
  },
}));

export const MobileNavigationButton = styled('button')(({ theme }) => ({
  minWidth: 0,
  minHeight: 52,
  padding: '5px 4px',
  border: 0,
  borderRadius: 10,
  background: 'transparent',
  color: theme.colors.textMuted,
  font: 'inherit',
  fontSize: 10,
  lineHeight: 1.15,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  ':focus-visible': {
    outline: '2px solid ' + theme.colors.focusRing,
    outlineOffset: -2,
  },
}));

export const MobileMoreBackdrop = styled('button')({
  display: 'none',
  '@media (max-width: 720px)': {
    display: 'block',
    position: 'fixed',
    inset: 0,
    zIndex: 1180,
    border: 0,
    padding: 0,
    background: 'rgba(0, 0, 0, 0.28)',
  },
});

export const MobileMoreSheet = styled('section')(({ theme }) => ({
  display: 'none',
  '@media (max-width: 720px)': {
    display: 'grid',
    position: 'fixed',
    left: 10,
    right: 10,
    bottom: 'calc(70px + env(safe-area-inset-bottom))',
    zIndex: 1190,
    padding: 10,
    gap: 6,
    borderRadius: 14,
    border: '1px solid ' + theme.colors.border,
    background: theme.colors.surface,
    boxShadow: '0 18px 44px rgba(0, 0, 0, 0.18)',
  },
}));

export const MobileMoreLink = styled(NavLink)(({ theme }) => ({
  minHeight: 44,
  padding: '0 12px',
  borderRadius: 10,
  color: theme.colors.text,
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  fontSize: 13,
  fontWeight: 800,
  '&.active': {
    color: theme.colors.primary,
    background: theme.colors.totalSoft,
  },
  ':focus-visible': {
    outline: '2px solid ' + theme.colors.focusRing,
  },
}));
