import styled from '@emotion/styled';

import {
  AuthButton,
  AuthSecondaryButton,
} from '../../theme/authPageUi';
import { authPalette } from '../../theme/palette';

export const PendingPanel = styled('div')({
  marginTop: 16,
  padding: 14,
  borderRadius: 12,
  border: '1px solid ' + authPalette.warningBorder,
  background: authPalette.warningBackground,
});

export const PendingHeader = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontWeight: 800,
});

export const PendingDescription = styled('p')({
  margin: '8px 0 0',
  color: authPalette.supportText,
  fontSize: 13,
});

export const OnboardingButtonRow = styled('div')({
  display: 'flex',
  gap: 8,
  marginTop: 12,
});

export const OnboardingTitle = styled('h1')({
  margin: '0 0 6px',
  fontSize: 24,
});

export const OnboardingIntro = styled('p')({
  margin: 0,
  color: authPalette.textMuted,
});

export const OnboardingDescription = styled('p')({
  margin: '0 0 18px',
  color: authPalette.textMuted,
  lineHeight: 1.5,
});

export const OnboardingField = styled('label')({
  display: 'grid',
  gap: 7,
  fontSize: 13,
});

export const SearchRow = styled('div')({
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8,
  marginTop: 12,
});

export const CandidateList = styled('div')({
  display: 'grid',
  gap: 8,
  marginTop: 12,
});

export const CandidateButton = styled(AuthSecondaryButton)({
  justifyContent: 'space-between',
  textAlign: 'left',
});

export const NewProfileSection = styled('div')({
  marginTop: 20,
  paddingTop: 16,
  borderTop: '1px solid ' + authPalette.divider,
});

export const NewProfileTitle = styled('div')({
  fontWeight: 800,
});

export const NewProfileDescription = styled('p')({
  margin: '5px 0 10px',
  color: authPalette.textMuted,
  fontSize: 13,
});

export const FullWidthAuthButton = styled(AuthButton)({
  width: '100%',
  marginTop: 8,
});

export const LogoutButton = styled(AuthSecondaryButton)({
  marginTop: 14,
});

export const AccountText = styled('div')({
  marginTop: 12,
  color: authPalette.subtleText,
  fontSize: 11,
});
