export interface SemanticThemeColors {
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryHover: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  danger: string;
  dangerSoft: string;
  dangerBorder: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  warningBorder: string;
  infoSoft: string;
  night: string;
  nightSoft: string;
  mixedSoft: string;
  offSoft: string;
  weekendSoft: string;
  department: string;
  departmentDrop: string;
  overlay: string;
  focusRing: string;
  tableHeaderStart: string;
  tableHeaderEnd: string;
  tableHeaderCell: string;
  tableHeaderWeekend: string;
  tableHeaderBorder: string;
  rowOdd: string;
  rowHover: string;
  foSoft: string;
  nightBadgeSoft: string;
  nightBadgeText: string;
  totalSoft: string;
}

export interface SemanticThemeShadows {
  card: string;
  sticky: string;
  stickyStrong: string;
  total: string;
  drawer: string;
  drawerMobile: string;
  dragOverlay: string;
}

export const palette = {
  white: '#ffffff',
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    700: '#334155',
    800: '#1f2937',
    850: '#172033',
    900: '#111827',
    925: '#0f1726',
    950: '#0f172a',
    975: '#0b1220',
    990: '#08111f',
  },
  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#173a63',
    900: '#132b48',
  },
  violet: {
    50: '#f5f3ff',
    100: '#ede9fe',
    400: '#a78bfa',
    600: '#7c3aed',
    800: '#403260',
    900: '#281f45',
  },
  indigo: {
    100: '#e0e7ff',
    300: '#a5b4fc',
    700: '#4338ca',
    900: '#252353',
  },
  emerald: {
    50: '#ecfdf5',
    300: '#6ee7b7',
    700: '#047857',
    950: '#0f2d25',
  },
  amber: {
    50: '#fffbeb',
    200: '#fde68a',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#b45309',
    950: '#392c10',
    975: '#3a2f17',
    borderDark: '#6b4d0f',
  },
  red: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    600: '#dc2626',
    700: '#b91c1c',
    900: '#7f1d1d',
    950: '#35191f',
    weekendLight: '#5f2630',
    weekendDark: '#451f2b',
    weekendSurfaceDark: '#2b1d24',
  },
  orange: {
    50: '#fff7ed',
  },
  gray: {
    50: '#fafafa',
    100: '#f3f4f6',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    700: '#374151',
  },
  custom: {
    darkInfo: '#12223a',
    darkRowHover: '#142238',
    darkOff: '#202a39',
  },
} as const;

export const alphaPalette = {
  white12: 'rgba(255, 255, 255, 0.12)',
  slate95006: 'rgba(15, 23, 42, 0.06)',
  slate95008: 'rgba(15, 23, 42, 0.08)',
  slate95009: 'rgba(15, 23, 42, 0.09)',
  slate95010: 'rgba(15, 23, 42, 0.10)',
  slate95016: 'rgba(15, 23, 42, 0.16)',
  slate95018: 'rgba(15, 23, 42, 0.18)',
  slate95028: 'rgba(15, 23, 42, 0.28)',
  slate95045: 'rgba(15, 23, 42, 0.45)',
  slate95046: 'rgba(15, 23, 42, 0.46)',
  slate40010: 'rgba(148, 163, 184, 0.10)',
  slate40014: 'rgba(148, 163, 184, 0.14)',
  slate40017: 'rgba(148, 163, 184, 0.17)',
  slate40018: 'rgba(148, 163, 184, 0.18)',
  slate40020: 'rgba(148, 163, 184, 0.20)',
  slate40028: 'rgba(148, 163, 184, 0.28)',
  blue50012: 'rgba(59, 130, 246, 0.12)',
  blue50013: 'rgba(59, 130, 246, 0.13)',
  blue40016: 'rgba(96, 165, 250, 0.16)',
  amber50007: 'rgba(245, 158, 11, 0.07)',
  amber50008: 'rgba(245, 158, 11, 0.08)',
  amber50028: 'rgba(245, 158, 11, 0.28)',
  amber50035: 'rgba(245, 158, 11, 0.35)',
  red60006: 'rgba(220, 38, 38, 0.06)',
  red60012: 'rgba(220, 38, 38, 0.12)',
  red60032: 'rgba(220, 38, 38, 0.32)',
  green50006: 'rgba(34, 197, 94, 0.06)',
  green50028: 'rgba(34, 197, 94, 0.28)',
  black18: 'rgba(0, 0, 0, 0.18)',
  black24: 'rgba(0, 0, 0, 0.24)',
  black28: 'rgba(0, 0, 0, 0.28)',
  black35: 'rgba(0, 0, 0, 0.35)',
  black68: 'rgba(0, 0, 0, 0.68)',
  surfaceLight94: 'rgba(255, 255, 255, 0.94)',
  surfaceDark94: 'rgba(15, 23, 42, 0.94)',
  surfaceDark96: 'rgba(17, 24, 39, 0.96)',
} as const;

export const lightThemeTokens: {
  colors: SemanticThemeColors;
  shadows: SemanticThemeShadows;
} = {
  colors: {
    background: '#f4f7fb',
    backgroundAlt: '#eef4ff',
    surface: alphaPalette.surfaceLight94,
    surfaceElevated: palette.white,
    text: palette.slate[800],
    textMuted: '#6b7280',
    border: '#e5e7eb',
    primary: palette.blue[500],
    primaryHover: palette.blue[600],
    onPrimary: palette.white,
    accent: palette.violet[600],
    accentSoft: palette.violet[50],
    accentBorder: palette.violet[100],
    danger: palette.red[600],
    dangerSoft: palette.red[50],
    dangerBorder: alphaPalette.red60032,
    success: palette.emerald[700],
    successSoft: palette.emerald[50],
    warning: palette.amber[600],
    warningSoft: palette.amber[50],
    warningBorder: palette.amber[200],
    infoSoft: palette.blue[50],
    night: palette.indigo[700],
    nightSoft: '#eef2ff',
    mixedSoft: palette.amber[50],
    offSoft: palette.gray[100],
    weekendSoft: '#fff7f7',
    department: palette.slate[100],
    departmentDrop: palette.blue[100],
    overlay: alphaPalette.slate95046,
    focusRing: alphaPalette.blue50012,
    tableHeaderStart: palette.slate[800],
    tableHeaderEnd: palette.gray[700],
    tableHeaderCell: '#273449',
    tableHeaderWeekend: palette.red.weekendLight,
    tableHeaderBorder: alphaPalette.white12,
    rowOdd: palette.gray[50],
    rowHover: palette.blue[50],
    foSoft: palette.blue[100],
    nightBadgeSoft: palette.indigo[100],
    nightBadgeText: palette.indigo[700],
    totalSoft: palette.blue[50],
  },
  shadows: {
    card: '0 12px 32px ' + alphaPalette.slate95009,
    sticky: '3px 0 8px ' + alphaPalette.slate95008,
    stickyStrong: '8px 0 12px -12px ' + alphaPalette.slate95045,
    total: '0 -3px 10px ' + alphaPalette.slate95010,
    drawer: '-20px 0 50px ' + alphaPalette.black18,
    drawerMobile: '0 -18px 42px ' + alphaPalette.black24,
    dragOverlay: '0 18px 45px ' + alphaPalette.slate95028,
  },
};

export const darkThemeTokens: {
  colors: SemanticThemeColors;
  shadows: SemanticThemeShadows;
} = {
  colors: {
    background: palette.slate[975],
    backgroundAlt: palette.slate[900],
    surface: alphaPalette.surfaceDark96,
    surfaceElevated: palette.slate[900],
    text: '#e5e7eb',
    textMuted: palette.slate[400],
    border: '#273449',
    primary: palette.blue[400],
    primaryHover: palette.blue[300],
    onPrimary: palette.slate[990],
    accent: palette.violet[400],
    accentSoft: palette.violet[900],
    accentBorder: palette.violet[800],
    danger: '#f87171',
    dangerSoft: palette.red[950],
    dangerBorder: alphaPalette.red60032,
    success: palette.emerald[300],
    successSoft: palette.emerald[950],
    warning: '#facc15',
    warningSoft: palette.amber[950],
    warningBorder: palette.amber.borderDark,
    infoSoft: palette.custom.darkInfo,
    night: palette.indigo[300],
    nightSoft: '#1b2343',
    mixedSoft: palette.amber[975],
    offSoft: palette.custom.darkOff,
    weekendSoft: palette.red.weekendSurfaceDark,
    department: palette.slate[850],
    departmentDrop: palette.blue[800],
    overlay: alphaPalette.black68,
    focusRing: alphaPalette.blue40016,
    tableHeaderStart: palette.slate[900],
    tableHeaderEnd: palette.slate[800],
    tableHeaderCell: palette.slate[850],
    tableHeaderWeekend: palette.red.weekendDark,
    tableHeaderBorder: alphaPalette.white12,
    rowOdd: palette.slate[925],
    rowHover: palette.custom.darkRowHover,
    foSoft: palette.blue[800],
    nightBadgeSoft: palette.indigo[900],
    nightBadgeText: palette.indigo[300],
    totalSoft: palette.blue[900],
  },
  shadows: {
    card: '0 14px 36px ' + alphaPalette.black35,
    sticky: '3px 0 8px ' + alphaPalette.slate95016,
    stickyStrong: '8px 0 12px -12px ' + alphaPalette.slate95045,
    total: '0 -3px 10px ' + alphaPalette.slate95010,
    drawer: '-20px 0 50px ' + alphaPalette.black18,
    drawerMobile: '0 -18px 42px ' + alphaPalette.black24,
    dragOverlay: '0 18px 45px ' + alphaPalette.slate95028,
  },
};

export const authPalette = {
  pageBackground: palette.slate[950],
  pageRadial: alphaPalette.blue50013,
  text: '#e5e7eb',
  textMuted: palette.slate[400],
  supportText: palette.slate[300],
  cardBorder: alphaPalette.slate40020,
  cardBackground: alphaPalette.surfaceDark94,
  cardShadow: '0 24px 70px ' + alphaPalette.black28,
  inputBorder: alphaPalette.slate40028,
  inputBackground: palette.slate[900],
  inputText: palette.slate[50],
  buttonBackground: palette.blue[600],
  buttonText: palette.white,
  secondaryBackground: alphaPalette.slate40014,
  secondaryBorder: alphaPalette.slate40018,
  errorBackground: alphaPalette.red60012,
  errorText: palette.red[200],
  warningBorder: alphaPalette.amber50028,
  warningBackground: alphaPalette.amber50007,
  divider: alphaPalette.slate40017,
  subtleText: palette.slate[500],
} as const;

export const fallbackPalette = {
  background: palette.slate[50],
  text: palette.slate[950],
  action: palette.blue[700],
  actionText: palette.white,
} as const;

export const statusPalette = {
  neutralBorder: alphaPalette.slate40028,
  warningBorder: alphaPalette.amber50035,
  warningBackground: alphaPalette.amber50008,
  dangerBorder: alphaPalette.red60032,
  dangerBackground: alphaPalette.red60006,
  successBorder: alphaPalette.green50028,
  successBackground: alphaPalette.green50006,
  neutralSoft: alphaPalette.slate40014,
  subtleBackground: alphaPalette.slate40010,
  overlayShadow: alphaPalette.slate95018,
} as const;

export const printPalette = {
  link: '#003399',
  text: palette.slate[900],
  onDark: palette.white,
  muted: palette.gray[400],
  header: palette.slate[800],
  danger: palette.red[900],
  weekend: palette.orange[50],
  border: palette.slate[200],
  secondary: palette.slate[500],
  dangerStrong: palette.red[700],
} as const;
