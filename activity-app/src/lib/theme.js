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
    // El botón del header y Ajustes muestran la misma preferencia.
    window.dispatchEvent(new CustomEvent('bardo-theme-change', { detail: nextTheme }));
  }, []);

  useEffect(() => {
    const sync = event => setThemeState(event.detail);
    window.addEventListener('bardo-theme-change', sync);
    return () => window.removeEventListener('bardo-theme-change', sync);
  }, []);

  useEffect(() => {
    applyDiscordTheme({ preference: theme });
  }, [theme]);

  return { theme, setTheme };
}
