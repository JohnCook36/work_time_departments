import '@emotion/react';

export type ThemeMode = 'light' | 'dark';

export interface AppTheme {
  mode: ThemeMode;
  colors: {
    background: string;
    backgroundAlt: string;
    surface: string;
    surfaceElevated: string;
    text: string;
    textMuted: string;
    border: string;
    primary: string;
    primaryHover: string;
    accent: string;
    danger: string;
    dangerSoft: string;
    successSoft: string;
    nightSoft: string;
    mixedSoft: string;
    offSoft: string;
    weekendSoft: string;
    department: string;
    departmentDrop: string;
    overlay: string;
  };
  shadow: string;
}

declare module '@emotion/react' {
  export interface Theme extends AppTheme {}
}

export const lightTheme: AppTheme = {
  mode: 'light',
  colors: {
    background: '#f4f7fb',
    backgroundAlt: '#eef4ff',
    surface: 'rgba(255, 255, 255, 0.94)',
    surfaceElevated: '#ffffff',
    text: '#1f2937',
    textMuted: '#6b7280',
    border: '#e5e7eb',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    accent: '#7c3aed',
    danger: '#dc2626',
    dangerSoft: '#fef2f2',
    successSoft: '#ecfdf5',
    nightSoft: '#eef2ff',
    mixedSoft: '#fffbeb',
    offSoft: '#f3f4f6',
    weekendSoft: '#fff7f7',
    department: '#f1f5f9',
    departmentDrop: '#dbeafe',
    overlay: 'rgba(15, 23, 42, 0.46)',
  },
  shadow: '0 12px 32px rgba(15, 23, 42, 0.09)',
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  colors: {
    background: '#0b1220',
    backgroundAlt: '#111827',
    surface: 'rgba(17, 24, 39, 0.96)',
    surfaceElevated: '#111827',
    text: '#e5e7eb',
    textMuted: '#94a3b8',
    border: '#273449',
    primary: '#60a5fa',
    primaryHover: '#93c5fd',
    accent: '#a78bfa',
    danger: '#f87171',
    dangerSoft: '#35191f',
    successSoft: '#0f2d25',
    nightSoft: '#1b2343',
    mixedSoft: '#3a2f17',
    offSoft: '#202a39',
    weekendSoft: '#2b1d24',
    department: '#172033',
    departmentDrop: '#173a63',
    overlay: 'rgba(0, 0, 0, 0.68)',
  },
  shadow: '0 14px 36px rgba(0, 0, 0, 0.35)',
};

export function getTheme(mode: ThemeMode): AppTheme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
