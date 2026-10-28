// El tema es de cada persona: se guarda en su cuenta (Ajustes → personal) y el
// dispositivo guarda una copia para arrancar ya con el tema correcto.
import {
  applyDiscordTheme,
  clearStoredThemePreference,
  getStoredThemeOwner,
  getStoredThemePreference,
  getThemePreference,
  storeThemePreference,
} from './discord-theme.js';
import {isPlannerRemoteEnabled, plannerRequest} from './planner/planner-sync.js';

export const THEME_CHANGE_EVENT = 'bardo-theme-change';
const THEME_PENDING_KEY = 'bardo-theme-preference-pending';

const currentUserId = () => (typeof window !== 'undefined' && window.__BARDO_USER__?.id) || null;

function setPending(pending) {
  try {
    if (pending) localStorage.setItem(THEME_PENDING_KEY, '1');
    else localStorage.removeItem(THEME_PENDING_KEY);
  } catch {}
}

function isPending() {
  try {
    return localStorage.getItem(THEME_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

function applyPreference(preference) {
  applyDiscordTheme({preference});
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, {detail: preference}));
}

async function uploadPreference(preference) {
  try {
    await plannerRequest('/api/settings/personal', {method: 'PATCH', body: JSON.stringify({theme: preference})});
    setPending(false);
  } catch {
    // Sin conexión: queda en el dispositivo y se sube en la próxima apertura.
    setPending(true);
  }
}

/** Elección manual: se aplica al tiro y se guarda en el dispositivo y en la cuenta. */
export function saveThemePreference(preference) {
  storeThemePreference(preference, currentUserId());
  applyPreference(preference);
  if (isPlannerRemoteEnabled()) void uploadPreference(preference);
}

/**
 * Al abrir Bardo en Discord: la cuenta manda. Una elección de este dispositivo
 * sin subir (o anterior a guardarla por cuenta) se sube; la de otra cuenta no
 * se hereda y se vuelve al oscuro por defecto.
 */
export async function syncThemePreference() {
  const userId = currentUserId();
  if (!isPlannerRemoteEnabled() || !userId) return;
  const local = getStoredThemePreference();
  const owner = getStoredThemeOwner();
  const mine = local && (!owner || owner === userId) ? local : null;

  let remote;
  try {
    remote = (await plannerRequest('/api/settings/personal'))?.personal?.theme || null;
  } catch {
    return;
  }

  if (mine && (isPending() || !remote)) {
    storeThemePreference(mine, userId);
    await uploadPreference(mine);
  } else if (remote) {
    storeThemePreference(remote, userId);
  } else {
    clearStoredThemePreference();
  }
  applyPreference(getThemePreference());
}
