/**
 * Claves de localStorage de Documentos, separadas por servidor + canal.
 *
 * La Activity de Discord usa el mismo origen en todos los canales, así que sin
 * este prefijo un borrador, la copia local o la cola de sincronización de un
 * canal (incluso privado) aparecían —y se podían publicar— en otro canal.
 * Fuera de Discord (desarrollo) no hay ámbito y se usan las claves base.
 */

export const DOCS_KEYS = Object.freeze({
  store: 'bardo.docs.heroui.v1',
  draft: 'bardo.docs.heroui.draft.v1',
  lastOpened: 'bardo.docs.heroui.last-opened.v1',
  journal: 'bardo.docs.editing.v1',
  pending: 'bardo.sync.pending.v1',
  importFailures: 'bardo.docs.import-failures.v1',
  minutesHashes: 'bardo.docs.minutes-hashes.v1',
});

let currentScope = null;

/** Ámbito `guild:canal`, o null si falta alguno de los dos. */
export function docsScopeFor(guildId, channelId) {
  const guild = String(guildId || '').trim();
  const channel = String(channelId || '').trim();
  return guild && channel ? `${guild}:${channel}` : null;
}

export function setDocsStorageScope(scope) {
  currentScope = scope || null;
  return currentScope;
}

export function getDocsStorageScope() {
  return currentScope;
}

/** Clave con ámbito (`base@guild:canal`); sin ámbito devuelve la clave base. */
export function scopedDocsKey(base, scope = currentScope) {
  return scope ? `${base}@${scope}` : base;
}

/**
 * Adopta una sola vez un valor antiguo sin ámbito (p. ej. el borrador de un
 * documento nuevo) en el canal actual, y borra la copia antigua para que no
 * aparezca en otros canales. Nunca pisa un valor ya guardado con ámbito.
 */
export function adoptLegacyDocsValue(storage, base, scope = currentScope) {
  if (!storage || !scope) return false;
  try {
    const scopedKey = scopedDocsKey(base, scope);
    const legacy = storage.getItem(base);
    if (legacy === null || legacy === undefined) return false;
    if (storage.getItem(scopedKey) === null) storage.setItem(scopedKey, legacy);
    storage.removeItem?.(base);
    return true;
  } catch {
    return false;
  }
}
