import styled from '@emotion/styled';

import { statusPalette } from '../../theme/palette';
import {
  ActionButton,
  Drawer,
  IconButton,
  Select,
  TextInput,
  TinyText,
} from '../../theme/styles';

export const CompactDrawer = styled(Drawer)({
  width: 'min(500px, 100vw)',
});

export const FullWidthInput = styled(TextInput)({
  width: '100%',
  minWidth: 0,
});

export const FullWidthSelect = styled(Select)({
  width: '100%',
});

export const TwoColumnGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
});

export const ShiftTimeGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: 10,
});

export const FieldHint = styled(TinyText)({
  marginBottom: 5,
});

export const TimeIconSlot = styled('span')({
  marginTop: 20,
  opacity: 0.6,
  display: 'inline-flex',
});

export const DrawerActionsGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  marginTop: 18,
});

export const FullRowActionButton = styled(ActionButton)({
  gridColumn: '1 / -1',
});

export const FullWidthActionButton = styled(ActionButton)({
  width: '100%',
});

export const DrawerNotice = styled('div')({
  marginTop: 16,
  padding: 12,
  borderRadius: 12,
  border: '1px solid ' + statusPalette.neutralBorder,
});

export const DrawerAlertText = styled(TinyText)({
  marginBottom: 14,
  fontSize: 12,
  fontWeight: 700,
});

export const EmptyIconSlot = styled('span')({
  display: 'block',
  width: 'fit-content',
  margin: '0 auto 8px',
  opacity: 0.55,
});

export const SmallIconButton = styled(IconButton)({
  width: 30,
  height: 30,
});


export const DrawerFieldError = styled('div')(({ theme }) => ({
  minHeight: 16,
  color: theme.colors.danger,
  fontSize: 11,
  lineHeight: '16px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}));

export const DrawerSection = styled('section')(({ theme }) => ({
  display: 'grid',
  gap: 10,
  padding: '14px 0',
  borderTop: '1px solid ' + theme.colors.border,
  ':first-of-type': {
    borderTop: 0,
    paddingTop: 0,
  },
}));

export const DrawerSectionTitle = styled('div')(({ theme }) => ({
  color: theme.colors.text,
  fontSize: 13,
  fontWeight: 800,
}));

export const DrawerButtonGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  '@media (max-width: 420px)': {
    gridTemplateColumns: '1fr',
  },
});

export const HiddenFileInput = styled('input')({
  display: 'none',
});


export const PublicationFeedback = styled('div')(({ theme }) => ({
  minHeight: 34,
  padding: '6px 8px',
  borderRadius: 8,
  color: theme.colors.textMuted,
  fontSize: 12,
  lineHeight: '18px',
}));

export const PublicationHistoryList = styled('div')({
  display: 'grid',
  alignContent: 'start',
  gap: 8,
  minHeight: 44,
  maxHeight: 180,
  overflowY: 'auto',
});

export const PublicationHistoryItem = styled('div')(({ theme }) => ({
  display: 'grid',
  gap: 4,
  padding: 10,
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
}));

export const PublicationHistoryMeta = styled(TinyText)({
  margin: 0,
});


export const ValidationResultPanel = styled('div')(({ theme }) => ({
  display: 'grid',
  alignContent: 'start',
  gap: 8,
  minHeight: 94,
  maxHeight: 240,
  overflowY: 'auto',
  padding: 10,
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
}));

export const ValidationGroupTitle = styled('div')(({ theme }) => ({
  color: theme.colors.text,
  fontSize: 12,
  fontWeight: 800,
}));

export const ValidationItem = styled('div')(({ theme }) => ({
  display: 'grid',
  gap: 5,
  padding: 9,
  borderRadius: 9,
  border: '1px solid ' + theme.colors.border,
  fontSize: 12,
  lineHeight: '17px',
}));

export const ValidationBadge = styled('span')<{
  $severity: 'hard' | 'soft';
}>(({ theme, $severity }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 20,
  padding: '1px 6px',
  borderRadius: 999,
  background:
    $severity === 'hard' ? theme.colors.dangerSoft : theme.colors.surfaceElevated,
  color: $severity === 'hard' ? theme.colors.danger : theme.colors.textMuted,
  fontSize: 10,
  fontWeight: 800,
}));

export const PublicationVersionDetail = styled('div')(({ theme }) => ({
  display: 'grid',
  alignContent: 'start',
  gap: 8,
  minHeight: 56,
  maxHeight: 360,
  overflowY: 'auto',
  padding: 10,
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
}));

export const PublicationDiffList = styled('div')({
  display: 'grid',
  gap: 7,
});

export const PublicationDiffItem = styled('div')(({ theme }) => ({
  display: 'grid',
  gap: 3,
  padding: 8,
  borderRadius: 8,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
  fontSize: 12,
  lineHeight: '17px',
}));

export const PublicationDiffChange = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  overflowWrap: 'anywhere',
}));


export const FullWidthTextArea = styled('textarea')(({ theme }) => ({
  width: '100%',
  minWidth: 0,
  minHeight: 72,
  resize: 'vertical',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
  color: theme.colors.text,
  font: 'inherit',
  lineHeight: '20px',
  ':focus': {
    outline: 'none',
    borderColor: theme.colors.primary,
    boxShadow: '0 0 0 2px ' + theme.colors.focusRing,
  },
}));

export const RulesList = styled('div')({
  display: 'grid',
  alignContent: 'start',
  gap: 8,
  minHeight: 92,
  maxHeight: 240,
  overflowY: 'auto',
});

export const RuleCard = styled('div')(({ theme }) => ({
  display: 'grid',
  gap: 7,
  padding: 10,
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
}));

export const RuleMetaRow = styled('div')({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
});

export const RuleBadge = styled('span')<{
  $tone: 'hard' | 'soft' | 'active' | 'inactive';
}>(({ theme, $tone }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 20,
  padding: '1px 7px',
  borderRadius: 999,
  background:
    $tone === 'hard'
      ? theme.colors.dangerSoft
      : $tone === 'active'
        ? theme.colors.successSoft
        : theme.colors.surfaceElevated,
  color:
    $tone === 'hard'
      ? theme.colors.danger
      : $tone === 'active'
        ? theme.colors.success
        : theme.colors.textMuted,
  fontSize: 10,
  fontWeight: 800,
}));

export const RuleConfigPanel = styled('div')({
  display: 'grid',
  gap: 8,
  minHeight: 78,
});

export const RuleFeedback = styled('div')(({ theme }) => ({
  minHeight: 38,
  padding: '7px 8px',
  borderRadius: 8,
  color: theme.colors.textMuted,
  fontSize: 12,
  lineHeight: '18px',
}));

export const RuleHistoryPanel = styled('div')(({ theme }) => ({
  display: 'grid',
  alignContent: 'start',
  gap: 7,
  minHeight: 72,
  maxHeight: 190,
  overflowY: 'auto',
  padding: 10,
  borderRadius: 10,
  border: '1px solid ' + theme.colors.border,
}));
