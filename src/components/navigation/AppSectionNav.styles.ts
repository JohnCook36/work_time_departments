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
