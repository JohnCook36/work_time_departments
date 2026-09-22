import styled from '@emotion/styled';

import { statusPalette } from '../../theme/palette';
import { ActionButton, TinyText } from '../../theme/styles';

export const ImportContent = styled('div')({
  display: 'grid',
  gap: 10,
  marginTop: 12,
});

export const ImportBox = styled('div')<{ $tone?: 'neutral' | 'warning' | 'danger' | 'success' }>(
  ({ $tone = 'neutral' }) => {
    const tones = {
      neutral: {
        border: statusPalette.neutralBorder,
        background: 'transparent',
      },
      warning: {
        border: statusPalette.warningBorder,
        background: statusPalette.warningBackground,
      },
      danger: {
        border: statusPalette.dangerBorder,
        background: statusPalette.dangerBackground,
      },
      success: {
        border: statusPalette.successBorder,
        background: statusPalette.successBackground,
      },
    }[$tone];

    return {
      padding: 12,
      borderRadius: 12,
      border: '1px solid ' + tones.border,
      background: tones.background,
    };
  },
);

export const ImportTitleRow = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const ImportStatsGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  marginTop: 12,
});

export const ImportAlertTitle = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontWeight: 800,
});

export const ImportHint = styled(TinyText)({
  marginTop: 7,
});

export const NameTags = styled('div')({
  marginTop: 8,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
});

export const NameTag = styled('span')({
  padding: '4px 7px',
  borderRadius: 8,
  background: statusPalette.neutralSoft,
  fontSize: 11,
});

export const InvalidList = styled('div')({
  marginTop: 8,
  display: 'grid',
  gap: 6,
  maxHeight: 210,
  overflowY: 'auto',
});

export const InvalidItem = styled('div')({
  padding: '7px 8px',
  borderRadius: 8,
  background: statusPalette.subtleBackground,
  fontSize: 11,
});

export const InvalidDetail = styled('div')({
  marginTop: 3,
});

export const InvalidValue = styled(InvalidDetail)({
  opacity: 0.8,
});

export const WarningItem = styled('div')({
  padding: 10,
  borderRadius: 10,
  border: '1px solid ' + statusPalette.warningBorder,
  fontSize: 12,
});

export const OverwriteLabel = styled('label')({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: 12,
  borderRadius: 12,
  border: '1px solid ' + statusPalette.neutralBorder,
  cursor: 'pointer',
});

export const OverwriteCheckbox = styled('input')({
  marginTop: 2,
});

export const OverwriteHelp = styled(TinyText)({
  display: 'block',
  marginTop: 4,
});

export const SuccessBox = styled(ImportBox)({
  display: 'flex',
  gap: 8,
});

export const SuccessIconSlot = styled('span')({
  display: 'inline-flex',
  flex: '0 0 auto',
});

export const ApplyImportButton = styled(ActionButton)({
  width: '100%',
  marginTop: 18,
});
