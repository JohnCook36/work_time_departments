import styled from '@emotion/styled';

export const Page = styled('div')(({ theme }) => ({
  minHeight: '100vh',
  padding: '18px',
  background: 'linear-gradient(135deg, ' + theme.colors.background + ' 0%, ' + theme.colors.backgroundAlt + ' 100%)',
  color: theme.colors.text,
  transition: 'background 180ms ease, color 180ms ease',
  '@media (max-width: 720px)': { padding: '10px' },
}));

export const Container = styled('div')({
  width: '100%',
  margin: '0 auto',
});

export const Card = styled('section')(({ theme }) => ({
  background: theme.colors.surface,
  border: '1px solid ' + theme.colors.border,
  borderRadius: 18,
  boxShadow: theme.shadow,
  backdropFilter: 'blur(14px)',
}));

export const HeaderCard = styled(Card)({
  padding: '18px 22px',
  marginBottom: 16,
  '@media (max-width: 760px)': {
    padding: 12,
  },
});

export const HeaderRow = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
  '@media (max-width: 760px)': {
    gap: 12,
    alignItems: 'stretch',
  },
});

export const HeaderLeft = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minWidth: 0,
  '@media (max-width: 760px)': {
    width: '100%',
  },
});

export const BrandBlock = styled('div')({
  minWidth: 0,
});

export const BrandTitle = styled('h1')(({ theme }) => ({
  margin: 0,
  fontSize: 24,
  lineHeight: 1.2,
  color: theme.colors.text,
  fontWeight: 800,
  '@media (max-width: 720px)': { fontSize: 20 },
}));

export const Muted = styled('p')(({ theme }) => ({
  margin: '4px 0 0',
  color: theme.colors.textMuted,
  fontSize: 13,
}));

export const IconButton = styled('button')(({ theme }) => ({
  width: 38,
  height: 38,
  borderRadius: 11,
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'transform 120ms ease, background 120ms ease, border-color 120ms ease',
  ':hover': {
    transform: 'translateY(-1px)',
    borderColor: theme.colors.primary,
  },
}));

export const ThemeButton = styled(IconButton)(({ theme }) => ({
  color: theme.colors.primary,
  flex: '0 0 auto',
}));

export const HeaderActions = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  '@media (max-width: 760px)': {
    width: '100%',
    justifyContent: 'space-between',
  },
});

export const MonthLabel = styled('div')(({ theme }) => ({
  minWidth: 170,
  textAlign: 'center',
  color: theme.colors.text,
  fontWeight: 700,
  fontSize: 17,
  userSelect: 'none',
  '@media (max-width: 760px)': {
    minWidth: 0,
    flex: 1,
    fontSize: 15,
  },
}));

export const HelpCard = styled(Card)(({ theme }) => ({
  padding: 16,
  marginBottom: 16,
  background: theme.colors.infoSoft,
}));

export const HelpGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 16,
  '@media (max-width: 760px)': { gridTemplateColumns: '1fr' },
});

export const ControlsCard = styled(Card)({
  padding: 14,
  marginBottom: 16,
  '@media (max-width: 760px)': {
    padding: 10,
  },
});

export const ControlsRow = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  '@media (max-width: 760px)': {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    alignItems: 'stretch',
    gap: 8,
    '& > input': {
      gridColumn: '1 / -1',
      width: '100%',
      minWidth: 0,
    },
    '& > select': {
      gridColumn: '1 / -1',
      width: '100%',
    },
    '& > button': {
      width: '100%',
      minWidth: 0,
    },
  },
});

const fieldStyles = (theme: any) => ({
  minHeight: 40,
  border: '1px solid ' + theme.colors.border,
  borderRadius: 10,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  padding: '0 12px',
  outline: 'none',
  fontSize: 14,
  transition: 'border-color 120ms ease, box-shadow 120ms ease',
  ':focus': {
    borderColor: theme.colors.primary,
    boxShadow: '0 0 0 3px ' + theme.colors.focusRing,
  },
});

export const TextInput = styled('input')(({ theme }) => ({
  ...fieldStyles(theme),
  flex: '1 1 240px',
  minWidth: 210,
}));

export const Select = styled('select')(({ theme }) => ({
  ...fieldStyles(theme),
}));

export const TextArea = styled('textarea')(({ theme }) => ({
  ...fieldStyles(theme),
  minHeight: 92,
  width: '100%',
  padding: 12,
  resize: 'vertical',
  fontFamily: 'inherit',
}));

export const ActionButton = styled('button')<{ $variant?: 'primary' | 'secondary' | 'danger' | 'accent' }>(({ theme, $variant = 'secondary' }) => {
  const palette = {
    primary: { bg: theme.colors.primary, color: theme.colors.onPrimary, border: theme.colors.primary },
    secondary: { bg: theme.colors.surfaceElevated, color: theme.colors.text, border: theme.colors.border },
    danger: { bg: theme.colors.dangerSoft, color: theme.colors.danger, border: theme.colors.dangerSoft },
    accent: { bg: theme.colors.accentSoft, color: theme.colors.accent, border: theme.colors.accentBorder },
  }[$variant];

  return {
    minHeight: 40,
    borderRadius: 10,
    border: '1px solid ' + palette.border,
    background: palette.bg,
    color: palette.color,
    padding: '0 13px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'transform 120ms ease, filter 120ms ease',
    ':hover': { transform: 'translateY(-1px)', filter: 'brightness(0.98)' },
  };
});

export const Divider = styled('div')(({ theme }) => ({
  width: 1,
  height: 28,
  background: theme.colors.border,
  '@media (max-width: 760px)': { display: 'none' },
}));

export const DepartmentPanel = styled(Card)({
  padding: 16,
  marginBottom: 16,
  '@media (max-width: 760px)': {
    padding: 12,
  },
});

export const PanelTitleRow = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 14,
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  marginBottom: 14,
});

export const PanelTitle = styled('h2')(({ theme }) => ({
  margin: 0,
  color: theme.colors.text,
  fontSize: 17,
}));

export const DepartmentGrid = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
  gap: 8,
});

export const DepartmentCard = styled('div')(({ theme }) => ({
  border: '1px solid ' + theme.colors.border,
  borderRadius: 12,
  padding: 11,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: theme.colors.surfaceElevated,
}));

export const DepartmentMeta = styled('div')({
  minWidth: 0,
  flex: 1,
});

export const DepartmentName = styled('div')(({ theme }) => ({
  color: theme.colors.text,
  fontWeight: 700,
  fontSize: 14,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}));

export const TinyText = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 11,
  marginTop: 2,
}));

export const TableShell = styled(Card)({
  position: 'relative',
  overflow: 'hidden',
});

export const TableScroll = styled('div')(({ theme }) => ({
  overflow: 'auto',
  maxHeight: 'calc(100vh - 245px)',
  minHeight: 320,
  scrollbarGutter: 'stable',
  overscrollBehavior: 'contain',
  WebkitOverflowScrolling: 'touch',
  background: theme.colors.surfaceElevated,
  '@media (max-width: 760px)': {
    maxHeight: 'calc(100dvh - 200px)',
    minHeight: 280,
  },
}));

export const ScheduleTable = styled('table')(({ theme }) => ({
  width: 'max-content',
  minWidth: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
  color: theme.colors.text,
  background: theme.colors.surfaceElevated,
}));

export const TableHeadRow = styled('tr')(({ theme }) => ({
  background:
    'linear-gradient(90deg, ' +
    theme.colors.tableHeaderStart +
    ', ' +
    theme.colors.tableHeaderEnd +
    ')',
  color: theme.colors.onPrimary,
}));

export const HeaderCell = styled('th')<{ $weekend?: boolean }>(({ theme, $weekend }) => ({
  position: 'sticky',
  top: 0,
  zIndex: 18,
  minWidth: 58,
  padding: '7px 3px',
  textAlign: 'center',
  fontWeight: 700,
  background: $weekend
    ? (theme.colors.tableHeaderWeekend)
    : (theme.colors.tableHeaderCell),
  borderBottom: '1px solid ' + theme.colors.tableHeaderBorder,
}));

export const StickyHeaderCell = styled('th')(({ theme }) => ({
  position: 'sticky',
  top: 0,
  left: 0,
  zIndex: 32,
  minWidth: 230,
  maxWidth: 230,
  padding: '9px 12px',
  textAlign: 'left',
  background: theme.colors.tableHeaderStart,
  borderRight: '1px solid ' + theme.colors.tableHeaderBorder,
  borderBottom: '1px solid ' + theme.colors.tableHeaderBorder,
  boxShadow: theme.shadows.sticky,
}));

export const DepartmentRowCell = styled('td')<{ $over: boolean }>(({ theme, $over }) => ({
  position: 'relative',
  padding: '8px 12px',
  borderTop: '1px solid ' + theme.colors.border,
  borderBottom: '1px solid ' + theme.colors.border,
  background: $over ? theme.colors.departmentDrop : theme.colors.department,
  transition: 'background 120ms ease',
}));

export const DepartmentRowInner = styled('div')(({ theme }) => ({
  position: 'sticky',
  left: 12,
  zIndex: 14,
  width: 'max-content',
  maxWidth: 'calc(100vw - 32px)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 28,
  paddingRight: 10,
  background: 'inherit',
  boxShadow: theme.shadows.stickyStrong,
}));

export const DepartmentBadge = styled('span')<{ $kind: 'general' | 'fo' | 'night' }>(({ theme, $kind }) => ({
  borderRadius: 999,
  padding: '3px 8px',
  fontSize: 10,
  lineHeight: 1,
  fontWeight: 800,
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  background:
    $kind === 'fo'
      ? (theme.colors.foSoft)
      : $kind === 'night'
        ? (theme.colors.nightBadgeSoft)
        : theme.colors.offSoft,
  color:
    $kind === 'fo'
      ? theme.colors.primary
      : $kind === 'night'
        ? (theme.colors.nightBadgeText)
        : theme.colors.textMuted,
}));

export const EmployeeRow = styled('tr')<{ $dragging: boolean; $odd: boolean }>(({ theme, $dragging, $odd }) => ({
  background: $odd ? (theme.colors.rowOdd) : theme.colors.surfaceElevated,
  opacity: $dragging ? 0.42 : 1,
  transition: 'background 120ms ease, opacity 120ms ease',
  ':hover': { background: theme.colors.rowHover },
}));

export const EmployeeCell = styled('td')(({ theme }) => ({
  position: 'sticky',
  left: 0,
  bottom: 0,
  zIndex: 28,
  minWidth: 230,
  maxWidth: 230,
  padding: '6px 8px',
  borderBottom: '1px solid ' + theme.colors.border,
  borderRight: '1px solid ' + theme.colors.border,
  background: 'inherit',
  boxShadow: theme.shadows.sticky,
}));

export const EmployeeCellInner = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 5,
});

export const DragHandle = styled('button')(({ theme }) => ({
  width: 28,
  height: 28,
  border: 0,
  borderRadius: 8,
  background: 'transparent',
  color: theme.colors.textMuted,
  cursor: 'grab',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  touchAction: 'none',
  ':hover': { color: theme.colors.primary, background: theme.colors.offSoft },
  ':active': { cursor: 'grabbing' },
}));

export const EmployeeNameText = styled('span')({
  flex: 1,
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontWeight: 700,
  fontSize: 13,
});

export const RowIconButton = styled('button')<{ $active?: boolean }>(({ theme, $active }) => ({
  width: 27,
  height: 27,
  border: '1px solid ' + ($active ? (theme.colors.warningBorder) : theme.colors.border),
  borderRadius: 8,
  background: $active ? (theme.colors.warningSoft) : theme.colors.surfaceElevated,
  color: $active ? (theme.colors.warning) : theme.colors.textMuted,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  position: 'relative',
  ':hover': { borderColor: theme.colors.primary, color: theme.colors.primary },
}));

export const WishCount = styled('span')(({ theme }) => ({
  position: 'absolute',
  top: -6,
  right: -6,
  minWidth: 16,
  height: 16,
  borderRadius: 999,
  padding: '0 4px',
  background: theme.colors.accent,
  color: theme.colors.onPrimary,
  fontSize: 9,
  fontWeight: 800,
  lineHeight: '16px',
  textAlign: 'center',
}));

export const ShiftCell = styled('td')<{
  $kind: 'empty' | 'error' | 'off' | 'day' | 'night' | 'mixed';
  $weekend: boolean;
  $interactive: boolean;
}>(({ theme, $kind, $weekend, $interactive }) => {
  const backgrounds = {
    empty: $weekend ? theme.colors.weekendSoft : 'transparent',
    error: theme.colors.dangerSoft,
    off: theme.colors.offSoft,
    day: theme.colors.successSoft,
    night: theme.colors.nightSoft,
    mixed: theme.colors.mixedSoft,
  };

  return {
    padding: 2,
    minWidth: 58,
    borderBottom: '1px solid ' + theme.colors.border,
    borderRight: '1px solid ' + theme.colors.border,
    textAlign: 'center',
    background: backgrounds[$kind],
    cursor: $interactive ? 'pointer' : 'default',
    transition: 'background 120ms ease, box-shadow 120ms ease',
    ...($interactive
      ? {
          ':hover': {
            boxShadow: 'inset 0 0 0 2px ' + theme.colors.primary,
          },
        }
      : {}),
  };
});

export const ShiftDisplay = styled('div')(({ theme }) => ({
  minHeight: 25,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 3px',
  borderRadius: 5,
  color: theme.colors.text,
  fontSize: 11,
  fontWeight: 700,
}));

export const ShiftInput = styled('input')(({ theme }) => ({
  width: '100%',
  height: 27,
  padding: '0 3px',
  border: '1px solid ' + theme.colors.primary,
  borderRadius: 5,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  textAlign: 'center',
  outline: 'none',
  fontSize: 11,
}));

export const MetricCell = styled('td')<{ $tone: 'day' | 'night' | 'total' | 'muted' }>(({ theme, $tone }) => ({
  minWidth: 62,
  padding: '7px 5px',
  borderBottom: '1px solid ' + theme.colors.border,
  borderRight: '1px solid ' + theme.colors.border,
  textAlign: 'center',
  fontWeight: $tone === 'total' ? 800 : 700,
  color:
    $tone === 'day'
      ? (theme.colors.success)
      : $tone === 'night'
        ? (theme.colors.nightBadgeText)
        : $tone === 'total'
          ? theme.colors.primary
          : theme.colors.textMuted,
  background:
    $tone === 'day'
      ? theme.colors.successSoft
      : $tone === 'night'
        ? theme.colors.nightSoft
        : $tone === 'total'
          ? (theme.colors.totalSoft)
          : 'transparent',
}));

export const TotalRow = styled('tr')(({ theme }) => ({
  background: theme.colors.department,
  fontWeight: 800,
  '& > td': {
    position: 'sticky',
    bottom: 0,
    zIndex: 20,
    boxShadow: theme.shadows.total,
  },
  '& > td:first-of-type': {
    zIndex: 28,
  },
}));

export const TotalCell = styled('td')(({ theme }) => ({
  padding: '8px 5px',
  borderTop: '2px solid ' + theme.colors.border,
  textAlign: 'center',
  color: theme.colors.text,
  background: theme.colors.department,
}));

export const StickyTotalCell = styled(TotalCell)(({ theme }) => ({
  position: 'sticky',
  left: 0,
  zIndex: 12,
  textAlign: 'left',
  paddingLeft: 12,
  background: theme.colors.department,
  boxShadow: theme.shadows.sticky,
}));

export const ErrorCard = styled(Card)(({ theme }) => ({
  marginTop: 14,
  padding: 14,
  background: theme.colors.dangerSoft,
  color: theme.colors.danger,
}));

export const Legend = styled('div')(({ theme }) => ({
  display: 'flex',
  gap: 14,
  flexWrap: 'wrap',
  marginTop: 14,
  color: theme.colors.textMuted,
  fontSize: 12,
}));

export const Footer = styled('div')(({ theme }) => ({
  textAlign: 'center',
  padding: '24px 0 8px',
  color: theme.colors.textMuted,
  fontSize: 12,
}));

export const DrawerOverlay = styled('div')(({ theme }) => ({
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: theme.colors.overlay,
  display: 'flex',
  justifyContent: 'flex-end',
  '@media (max-width: 760px)': {
    alignItems: 'flex-end',
  },
}));

export const Drawer = styled('aside')(({ theme }) => ({
  width: 'min(440px, 100vw)',
  height: '100%',
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  boxShadow: theme.shadows.drawer,
  padding: 20,
  overflowY: 'auto',
  borderLeft: '1px solid ' + theme.colors.border,
  '@media (max-width: 760px)': {
    width: '100%',
    height: 'min(88vh, 760px)',
    padding: 16,
    borderLeft: 0,
    borderTop: '1px solid ' + theme.colors.border,
    borderRadius: '18px 18px 0 0',
    boxShadow: theme.shadows.drawerMobile,
  },
}));

export const DrawerHeader = styled('div')({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 18,
});

export const DrawerTitle = styled('h2')({
  margin: 0,
  fontSize: 20,
});

export const DrawerSubtitle = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 12,
  marginTop: 4,
}));

export const FormLabel = styled('label')(({ theme }) => ({
  display: 'block',
  marginBottom: 6,
  color: theme.colors.textMuted,
  fontSize: 12,
  fontWeight: 700,
}));

export const FormGroup = styled('div')({
  marginBottom: 14,
});

export const QuickChips = styled('div')({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 7,
  marginTop: 8,
});

export const QuickChip = styled('button')(({ theme }) => ({
  border: '1px solid ' + theme.colors.border,
  background: theme.colors.surface,
  color: theme.colors.textMuted,
  borderRadius: 999,
  padding: '6px 9px',
  fontSize: 11,
  cursor: 'pointer',
  ':hover': { color: theme.colors.primary, borderColor: theme.colors.primary },
}));

export const WishList = styled('div')({
  display: 'grid',
  gap: 8,
  marginTop: 18,
});

export const WishCard = styled('div')(({ theme }) => ({
  border: '1px solid ' + theme.colors.border,
  borderRadius: 12,
  padding: 11,
  background: theme.colors.surface,
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
}));

export const WishDay = styled('div')(({ theme }) => ({
  minWidth: 58,
  color: theme.colors.accent,
  fontSize: 11,
  fontWeight: 800,
}));

export const WishText = styled('div')({
  flex: 1,
  fontSize: 13,
  lineHeight: 1.4,
});

export const EmptyState = styled('div')(({ theme }) => ({
  padding: 24,
  textAlign: 'center',
  color: theme.colors.textMuted,
  fontSize: 13,
}));

export const MobileScheduleShell = styled('div')(({ theme }) => ({
  display: 'grid',
  gap: 12,
  '@media (min-width: 761px)': {
    display: 'none',
  },
}));

export const MobileWeekBar = styled(Card)(({ theme }) => ({
  padding: 10,
  display: 'grid',
  gridTemplateColumns: '40px 1fr 40px',
  alignItems: 'center',
  gap: 8,
  position: 'sticky',
  top: 8,
  zIndex: 30,
  border: '1px solid ' + theme.colors.border,
}));

export const MobileWeekLabel = styled('div')(({ theme }) => ({
  textAlign: 'center',
  color: theme.colors.text,
  fontSize: 14,
  fontWeight: 800,
}));

export const MobileDepartmentBlock = styled(Card)({
  overflow: 'hidden',
});

export const MobileDepartmentHeader = styled('div')<{ $over: boolean }>(({ theme, $over }) => ({
  padding: '11px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: $over ? theme.colors.departmentDrop : theme.colors.department,
  borderBottom: '1px solid ' + theme.colors.border,
  transition: 'background 120ms ease',
}));

export const MobileEmployeesList = styled('div')({
  display: 'grid',
});

export const MobileEmployeeCard = styled('article')<{ $dragging: boolean }>(({ theme, $dragging }) => ({
  padding: 12,
  borderBottom: '1px solid ' + theme.colors.border,
  background: theme.colors.surfaceElevated,
  opacity: $dragging ? 0.45 : 1,
  transition: 'opacity 120ms ease, background 120ms ease',
  ':last-of-type': {
    borderBottom: 0,
  },
}));

export const MobileEmployeeHeader = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginBottom: 10,
});

export const MobileEmployeeName = styled('div')(({ theme }) => ({
  flex: 1,
  minWidth: 0,
  color: theme.colors.text,
  fontSize: 14,
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}));

export const MobileTotals = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 6,
  marginBottom: 10,
});

export const MobileTotalChip = styled('div')<{ $tone?: 'day' | 'night' | 'total' | 'muted' }>(({ theme, $tone = 'muted' }) => ({
  border: '1px solid ' + theme.colors.border,
  borderRadius: 9,
  padding: '6px 4px',
  textAlign: 'center',
  background:
    $tone === 'day'
      ? theme.colors.successSoft
      : $tone === 'night'
        ? theme.colors.nightSoft
        : $tone === 'total'
          ? (theme.colors.totalSoft)
          : theme.colors.offSoft,
  color:
    $tone === 'day'
      ? (theme.colors.success)
      : $tone === 'night'
        ? (theme.colors.nightBadgeText)
        : $tone === 'total'
          ? theme.colors.primary
          : theme.colors.textMuted,
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1.25,
}));

export const MobileTotalValue = styled('div')({
  fontSize: 14,
  fontWeight: 900,
  marginTop: 2,
});

export const MobileDaysList = styled('div')({
  display: 'grid',
  gap: 6,
});

export const MobileDayRow = styled('div')<{ $weekend: boolean; $kind: 'empty' | 'error' | 'off' | 'day' | 'night' | 'mixed' }>(({ theme, $weekend, $kind }) => {
  const backgrounds = {
    empty: $weekend ? theme.colors.weekendSoft : theme.colors.surface,
    error: theme.colors.dangerSoft,
    off: theme.colors.offSoft,
    day: theme.colors.successSoft,
    night: theme.colors.nightSoft,
    mixed: theme.colors.mixedSoft,
  };

  return {
    minHeight: 48,
    display: 'grid',
    gridTemplateColumns: '78px 1fr',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    border: '1px solid ' + theme.colors.border,
    borderRadius: 10,
    background: backgrounds[$kind],
  };
});

export const MobileDayLabel = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1.2,
}));

export const MobileShiftButton = styled('button')(({ theme }) => ({
  minHeight: 34,
  width: '100%',
  border: '1px solid ' + theme.colors.border,
  borderRadius: 8,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  padding: '4px 8px',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
  textAlign: 'center',
}));

export const MobileShiftInput = styled('input')(({ theme }) => ({
  width: '100%',
  minHeight: 36,
  border: '1px solid ' + theme.colors.primary,
  borderRadius: 8,
  background: theme.colors.surfaceElevated,
  color: theme.colors.text,
  padding: '0 8px',
  fontSize: 14,
  textAlign: 'center',
  outline: 'none',
}));

export const DesktopScheduleOnly = styled('div')({
  display: 'block',
  '@media (max-width: 760px)': {
    display: 'none',
  },
});

export const MobileEmptyDepartment = styled('div')(({ theme }) => ({
  padding: 14,
  color: theme.colors.textMuted,
  fontSize: 12,
  textAlign: 'center',
  background: theme.colors.surface,
}));

export const MobileHint = styled('div')(({ theme }) => ({
  color: theme.colors.textMuted,
  fontSize: 11,
  textAlign: 'center',
  padding: '2px 8px 0',
}));

