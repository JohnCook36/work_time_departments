import '@emotion/react';

import {
  darkThemeTokens,
  lightThemeTokens,
  SemanticThemeColors,
  SemanticThemeShadows,
} from './palette';

export type ThemeMode = 'light' | 'dark';

export interface AppTheme {
  mode: ThemeMode;
  colors: SemanticThemeColors;
  shadows: SemanticThemeShadows;
  shadow: string;
}

declare module '@emotion/react' {
  export interface Theme extends AppTheme {}
}

export const lightTheme: AppTheme = {
  mode: 'light',
  colors: lightThemeTokens.colors,
  shadows: lightThemeTokens.shadows,
  shadow: lightThemeTokens.shadows.card,
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  colors: darkThemeTokens.colors,
  shadows: darkThemeTokens.shadows,
  shadow: darkThemeTokens.shadows.card,
};

export function getTheme(mode: ThemeMode): AppTheme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
