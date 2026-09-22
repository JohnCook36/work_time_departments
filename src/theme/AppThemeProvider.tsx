import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { Global, ThemeProvider } from '@emotion/react';

import { useThemeMode } from '../hooks/useThemeMode';
import { getTheme, ThemeMode } from './theme';

interface AppThemeContextValue {
  themeMode: ThemeMode;
  toggleTheme: () => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useThemeMode();
  const theme = useMemo(() => getTheme(themeMode), [themeMode]);

  const value = useMemo(
    () => ({
      themeMode,
      toggleTheme: () =>
        setThemeMode((current) => (current === 'light' ? 'dark' : 'light')),
    }),
    [setThemeMode, themeMode],
  );

  return (
    <AppThemeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <Global
          styles={(activeTheme) => ({
            '*': { boxSizing: 'border-box' },
            html: { colorScheme: activeTheme.mode },
            body: {
              margin: 0,
              minWidth: 320,
              fontFamily:
                'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              background: activeTheme.colors.background,
              color: activeTheme.colors.text,
            },
            button: { fontFamily: 'inherit' },
            input: { fontFamily: 'inherit' },
            select: { fontFamily: 'inherit' },
            textarea: { fontFamily: 'inherit' },
          })}
        />
        {children}
      </ThemeProvider>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error('AppThemeProvider is unavailable');
  }

  return context;
}
