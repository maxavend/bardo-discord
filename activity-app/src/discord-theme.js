import {useEffect, useState} from 'react';

export function resolveDiscordTheme({allowSystem = true} = {}) {
  if (typeof window === 'undefined') return 'dark';
  const normalizeTheme = value => {
    const normalized = String(value || '').trim().toLowerCase().replace(/^['"]|['"]$/g, '');
    return normalized === 'dark' || normalized === 'light' ? normalized : null;
  };

  try {
    const queryTheme = normalizeTheme(new URLSearchParams(window.location.search).get('theme'));
    if (queryTheme) return queryTheme;
  } catch {}

  try {
    for (const element of [document.body, document.documentElement].filter(Boolean)) {
      const datasetTheme = normalizeTheme(element.dataset?.theme || element.dataset?.colorScheme);
      if (datasetTheme) return datasetTheme;
      if (element.classList?.contains('theme-dark')) return 'dark';
      if (element.classList?.contains('theme-light')) return 'light';
      const styles = getComputedStyle(element);
      for (const property of ['--discord-theme', '--discord-color-scheme', '--color-scheme']) {
        const customTheme = normalizeTheme(styles.getPropertyValue(property));
        if (customTheme) return customTheme;
      }
    }
  } catch {}

  if (!allowSystem) return null;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function collectDiscordThemeDiagnostics() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const customProperties = ['--discord-theme', '--discord-color-scheme', '--color-scheme'];
  const inspect = element => {
    const styles = getComputedStyle(element);
    return {
      className: typeof element.className === 'string' ? element.className : '',
      dataTheme: element.dataset?.theme || null,
      dataColorScheme: element.dataset?.colorScheme || null,
      colorScheme: styles.colorScheme || null,
      customProperties: Object.fromEntries(customProperties.map(property => [property, styles.getPropertyValue(property).trim() || null])),
    };
  };
  const params = new URLSearchParams(window.location.search);
  const diagnostics = {
    capturedAt: new Date().toISOString(),
    resolvedTheme: document.documentElement.dataset.theme || null,
    query: Object.fromEntries(['theme', 'frame_id', 'instance_id', 'platform'].map(key => [key, params.get(key)])),
    media: {
      dark: Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches),
      light: Boolean(window.matchMedia?.('(prefers-color-scheme: light)').matches),
    },
    userAgent: navigator.userAgent,
    html: inspect(document.documentElement),
    body: inspect(document.body),
  };
  window.__BARDO_THEME_DIAGNOSTICS__ = diagnostics;
  if (params.get('bardo_theme_debug') === '1') console.info('[Bardo theme diagnostics]', diagnostics);
  return diagnostics;
}

function applyTheme(targetTheme) {
  const resolved = targetTheme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
  return resolved;
}

export function applyDiscordTheme(options = {}) {
  const resolved = resolveDiscordTheme(options);
  const applied = resolved ? applyTheme(resolved) : (document.documentElement.dataset.theme || 'light');
  collectDiscordThemeDiagnostics();
  return applied;
}

export function useThemeMode() {
  const [resolvedTheme, setResolvedTheme] = useState(() => applyDiscordTheme());
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const syncTheme = () => setResolvedTheme(applyDiscordTheme());
    media?.addEventListener?.('change', syncTheme);
    window.addEventListener('discord-theme-change', syncTheme);
    syncTheme();
    return () => {
      media?.removeEventListener?.('change', syncTheme);
      window.removeEventListener('discord-theme-change', syncTheme);
    };
  }, []);
  return {theme: resolvedTheme, resolvedTheme};
}

if (typeof document !== 'undefined') applyDiscordTheme({allowSystem: false});
