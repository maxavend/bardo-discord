// Ajustes del lado de la Activity: lectura/escritura en el Worker, zona
// horaria efectiva y preferencias que viven en este dispositivo.
import {isPlannerRemoteEnabled, plannerRequest} from '../planner/planner-sync.js';
import {scopedDocsKey} from '../docs-storage.js';

const START_MODULE_KEY = 'bardo.settings.start-module.v1';
const LAST_MODULE_KEY = 'bardo.settings.last-module.v1';
export const SETTINGS_CHANGE_EVENT = 'bardo-workspace-change';

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';
  } catch {
    return 'America/Santiago';
  }
}

/** Zona horaria con la que se calcula "hoy", "vencida" y las fechas de los comandos. */
export function currentTimeZone() {
  const context = (typeof window !== 'undefined' && window.__bardoChannelContext) || null;
  return context?.timeZone || deviceTimeZone();
}

export function listTimeZones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
  } catch {
    // Navegadores antiguos: lista mínima.
  }
  return ['America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/New_York', 'Europe/Madrid', 'UTC'];
}

/** «Santiago · GMT-3» para mostrar una zona horaria. */
export function describeTimeZone(timeZone, now = new Date()) {
  const city = String(timeZone || '').split('/').pop().replace(/_/g, ' ');
  try {
    const offset = new Intl.DateTimeFormat('es-CL', {timeZone, timeZoneName: 'shortOffset'})
      .formatToParts(now).find(part => part.type === 'timeZoneName')?.value;
    return offset ? `${city} · ${offset}` : city;
  } catch {
    return city;
  }
}

export async function fetchSettings() {
  return plannerRequest('/api/settings');
}

export async function patchSettings(section, fields) {
  return plannerRequest(`/api/settings/${section}`, {method: 'PATCH', body: JSON.stringify(fields)});
}

/** Lleva los cambios del espacio al resto de la app (nombre en el header, "hoy"). */
export function applySettingsSnapshot(snapshot) {
  if (!snapshot || typeof window === 'undefined') return;
  window.__bardoChannelContext = {
    ...(window.__bardoChannelContext || {}),
    workspaceName: snapshot.space?.name || null,
    timeZone: snapshot.effective?.timeZone || null,
    timeZoneSource: snapshot.effective?.sources?.timeZone || null,
  };
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT));
}

/**
 * La primera vez que alguien abre Bardo en un servidor sin zona horaria, se
 * guarda la de su dispositivo. Nunca pisa una ya elegida.
 */
export async function reportDetectedTimeZone(context = window.__bardoChannelContext) {
  if (!isPlannerRemoteEnabled() || context?.timeZoneSource !== 'default') return;
  try {
    const timeZone = deviceTimeZone();
    const result = await plannerRequest('/api/settings/detected-time-zone', {method: 'POST', body: JSON.stringify({timeZone})});
    if (result?.saved) {
      window.__bardoChannelContext = {...(window.__bardoChannelContext || {}), timeZone, timeZoneSource: 'server'};
      window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT));
    }
  } catch {
    // Sin conexión: se intentará en la próxima apertura.
  }
}

// ---------------------------------------------------------------------------
// Preferencias de este dispositivo

export function getStartModulePreference() {
  try {
    return localStorage.getItem(scopedDocsKey(START_MODULE_KEY)) === 'last' ? 'last' : 'home';
  } catch {
    return 'home';
  }
}

export function setStartModulePreference(value) {
  try {
    localStorage.setItem(scopedDocsKey(START_MODULE_KEY), value === 'last' ? 'last' : 'home');
  } catch {
    // Sin almacenamiento: vale para esta sesión.
  }
}

export function rememberLastModule(hash) {
  try {
    localStorage.setItem(scopedDocsKey(LAST_MODULE_KEY), hash);
  } catch {
    // Ignorar: es solo una comodidad.
  }
}

export function lastModuleHash() {
  try {
    const hash = localStorage.getItem(scopedDocsKey(LAST_MODULE_KEY));
    return ['#docs', '#planner', '#kanban'].includes(hash) ? hash : null;
  } catch {
    return null;
  }
}
