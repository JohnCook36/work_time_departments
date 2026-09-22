import styled from '@emotion/styled';

import {
  AuthButton,
  AuthSecondaryButton,
} from '../../theme/authPageUi';
import { authPalette } from '../../theme/palette';

export const LoginEyebrow = styled('div')({
  fontSize: 13,
  color: authPalette.buttonBackground,
  fontWeight: 800,
});

export const LoginTitle = styled('h1')({
  margin: '8px 0 6px',
  fontSize: 26,
});

export const LoginDescription = styled('p')({
  margin: '0 0 20px',
  color: authPalette.textMuted,
  lineHeight: 1.5,
});

export const LoginFieldLabel = styled('label')<{ $spaced?: boolean }>(
  ({ $spaced = false }) => ({
    display: 'grid',
    gap: 7,
    marginTop: $spaced ? 14 : 0,
    fontSize: 13,
  }),
);

export const LoginActions = styled('div')({
  display: 'flex',
  gap: 8,
  marginTop: 18,
});

export const LoginFullWidthButton = styled(AuthButton)({
  width: '100%',
});

export const LoginFlexButton = styled(AuthButton)({
  flex: 1,
});

export const LoginFlexSecondaryButton = styled(AuthSecondaryButton)({
  flex: 1,
});
