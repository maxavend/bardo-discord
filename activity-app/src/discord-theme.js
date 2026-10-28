export const THEME_PREFERENCE_KEY = 'bardo-theme-preference';
// Quién eligió el tema guardado en este dispositivo: la preferencia es de cada
// persona (se guarda en su cuenta), así que no se hereda de otra cuenta.
export const THEME_OWNER_KEY = 'bardo-theme-preference-owner';
export const DEFAULT_THEME = 'dark';
const LEGACY_THEME_KEYS = ['heroui-theme', 'bardo.theme.preference.v1'];

function normalizeTheme(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/^['"]|['"]$/g, '');
  return normalized === 'dark' || normalized === 'light' ? normalized : null;
}

function normalizePreference(value) {
  return normalizeTheme(value) || (String(value || '').trim().toLowerCase() === 'system' ? 'system' : null);
}

/** Tema elegido a mano en este dispositivo (claro, oscuro o sistema), o null. */
export function getStoredThemePreference() {
  try {
    const preference = normalizePreference(localStorage.getItem(THEME_PREFERENCE_KEY));
    if (preference) return preference;
    for (const legacyKey of LEGACY_THEME_KEYS) {
      const legacyPreference = normalizeTheme(localStorage.getItem(legacyKey));
      if (legacyPreference) {
        localStorage.setItem(THEME_PREFERENCE_KEY, legacyPreference);
        return legacyPreference;
      }
    }
  } catch {}
  return null;
}

export function getStoredThemeOwner() {
  try {
    return localStorage.getItem(THEME_OWNER_KEY) || null;
  } catch {
    return null;
  }
}

export function storeThemePreference(preference, ownerId = null) {
  const normalized = normalizePreference(preference);
  if (!normalized) return;
  try {
    localStorage.setItem(THEME_PREFERENCE_KEY, normalized);
    if (ownerId) localStorage.setItem(THEME_OWNER_KEY, String(ownerId));
  } catch {}
}

export function clearStoredThemePreference() {
  try {
    localStorage.removeItem(THEME_PREFERENCE_KEY);
    localStorage.removeItem(THEME_OWNER_KEY);
    for (const legacyKey of LEGACY_THEME_KEYS) localStorage.removeItem(legacyKey);
  } catch {}
}

/**
 * Oscuro salvo que la persona haya elegido otro tema. Ni Discord ni el sistema
 * cambian el tema por defecto; solo «Sistema», si se elige, los sigue.
 * `?theme=` sirve para pruebas y vistas previas.
 */
export function getThemePreference() {
  const stored = getStoredThemePreference();
  if (stored) return stored;
  try {
    const queryTheme = normalizeTheme(new URLSearchParams(window.location.search).get('theme'));
    if (queryTheme) return queryTheme;
  } catch {}
  return DEFAULT_THEME;
}

function resolveSystemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveDiscordTheme({allowSystem = true} = {}) {
  if (typeof window === 'undefined') return 'dark';

  try {
    const queryTheme = normalizeTheme(new URLSearchParams(window.location.search).get('theme'));
    if (queryTheme) return queryTheme;
  } catch {}

  try {
    const elements = [document.body, document.documentElement].filter(Boolean);
    for (const element of elements) {
      const isAppRoot = element === document.documentElement && element.dataset?.bardoTheme;
      if (isAppRoot) continue;

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

  return allowSystem ? resolveSystemTheme() : null;
}

function applyTheme(targetTheme) {
  const resolved = targetTheme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.setAttribute('data-theme', resolved);
  root.dataset.bardoTheme = resolved;
  root.style.colorScheme = resolved;
  return resolved;
}

export function applyDiscordTheme({preference, allowSystem = true} = {}) {
  const selected = normalizePreference(preference) || getThemePreference();
  const resolved = selected === 'system'
    ? (resolveDiscordTheme({allowSystem}) || DEFAULT_THEME)
    : selected;
  const applied = applyTheme(resolved);
  collectDiscordThemeDiagnostics();
  return applied;
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
    preference: getThemePreference(),
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

if (typeof document !== 'undefined') applyDiscordTheme({allowSystem: false});
