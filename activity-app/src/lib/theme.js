import { useState, useEffect, useCallback } from 'react';
import { getThemePreference, applyDiscordTheme, THEME_PREFERENCE_KEY } from '@/discord-theme.js';

export function useTheme(defaultTheme = 'system') {
  const [theme, setThemeState] = useState(() => {
    return getThemePreference() || defaultTheme;
  });

  const setTheme = useCallback((nextTheme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem(THEME_PREFERENCE_KEY, nextTheme);
    } catch {}
    applyDiscordTheme({ preference: nextTheme });
  }, []);

  useEffect(() => {
    applyDiscordTheme({ preference: theme });
  }, [theme]);

  return { theme, setTheme };
}
