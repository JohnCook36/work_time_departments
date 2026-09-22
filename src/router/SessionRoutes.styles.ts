import styled from '@emotion/styled';

import { AuthButton } from '../theme/authPageUi';
import { authPalette } from '../theme/palette';

export const SessionMuted = styled('div')({
  color: authPalette.textMuted,
});

export const SessionErrorTitle = styled('h1')({
  marginTop: 0,
});

export const SessionErrorText = styled('p')({
  color: authPalette.textMuted,
});

export const SessionRetryButton = styled(AuthButton)({});
