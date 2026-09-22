import { useEffect, useState } from 'react';

import { ThemeMode } from '../theme/theme';

const THEME_KEY = 'hotel-shift-planner-theme';

function loadThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore
  }

  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }

  return 'light';
}

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(loadThemeMode);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, themeMode);
    } catch {
      // Browser storage may be unavailable.
    }
  }, [themeMode]);

  return [themeMode, setThemeMode] as const;
}
