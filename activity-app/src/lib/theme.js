import { useState, useEffect, useCallback } from 'react';
import { getThemePreference } from '@/discord-theme.js';
import { saveThemePreference, THEME_CHANGE_EVENT } from '@/theme-sync.js';

// Oscuro por defecto; la elección manual se guarda en la cuenta (theme-sync.js).
export function useTheme() {
  const [theme, setThemeState] = useState(getThemePreference);

  const setTheme = useCallback((nextTheme) => {
    setThemeState(nextTheme);
    // El botón del header y Ajustes muestran la misma preferencia.
    saveThemePreference(nextTheme);
  }, []);

  useEffect(() => {
    const sync = event => setThemeState(event.detail);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  return { theme, setTheme };
}
