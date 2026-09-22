import { Link } from 'react-router-dom';
import styled from '@emotion/styled';

import { Card, Muted } from '../../theme/styles';

export const ServerModeCard = styled(Card)({
  marginTop: 14,
  padding: 16,
});

export const ServerModeDescription = styled(Muted)({
  marginTop: 4,
});

export const PersonalScheduleLink = styled(Link)(({ theme }) => ({
  width: 38,
  height: 38,
  borderRadius: 11,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  transition: 'transform 120ms ease, background 120ms ease, border-color 120ms ease',
  ':hover': {
    transform: 'translateY(-1px)',
    borderColor: theme.colors.primary,
    color: theme.colors.primary,
  },
}));
