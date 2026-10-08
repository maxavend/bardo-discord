/**
 * Motor de sincronización de documentos (Discord ↔ D1).
 *
 * - Calcula diferencias entre el store local y el último estado confirmado por el
 *   servidor (`remote`) y encola escrituras.
 * - La cola se persiste en localStorage (`bardo.sync.pending.v1`) para sobrevivir
 *   a recargas; si el almacenamiento falla, sigue en memoria.
 * - Reintenta 503/429/5xx/errores de red con backoff (1 s, 2 s, 4 s… máx. 30 s);
 *   nunca reintenta automáticamente 400/401/403/404/409/413.
 * - PATCH envía `baseUpdatedAt`; un 409 `conflict` conserva la versión del usuario
 *   como copia y adopta la del servidor (ver `onRemote`).
 * - Emite estados `saving | saved | offline | error | conflict` por documento.
 * - La cola vive en una clave por servidor + canal (`pendingKey`). Las entradas
 *   antiguas sin ámbito (`legacyPendingKey`, de antes de separar por canal):
 *     · documentos que nunca llegaron al servidor (ids `local-…` sin base:
 *       nuevos, copias en conflicto, recuperados) se adoptan en el PRIMER canal
 *       que se abra tras la actualización, se crean ahí y se ven en la biblioteca;
 *     · documentos del servidor se adoptan solo si pertenecen a este canal;
 *     · el resto queda "estacionado", visible para el usuario (parkedSummary)
 *       con Reintentar / Descartar; nunca se recrea como documento nuevo aquí.
 * - Marcar una tarea en el lector no genera "copia en conflicto": ante un 409 se
 *   reaplican solo esas tareas sobre la versión del servidor (máx. 2 intentos).
 */
import {htmlToMarkdown, markdownToHtml} from './editor/bardo-markdown.js';
import {applyChecklistOps} from './docs-text.js';
import {DOCS_KEYS} from './docs-storage.js';

export const DOCS_STORE_KEY = DOCS_KEYS.store;
export const DOCS_PENDING_KEY = DOCS_KEYS.pending;
export const MAX_CHECKLIST_REBASES = 2;
export const NETWORK_ERROR_MESSAGE = 'Sin conexión con Bardo. Revisa tu conexión e intenta de nuevo.';
// La cuota de keepalive (~64 KB) se comparte con el planner: los envíos de
// documentos al cerrar se limitan a ~60 KB en total, medidos en bytes UTF-8.
export const KEEPALIVE_MAX_BYTES = 60_000;
const encoder = new TextEncoder();

export function utf8Bytes(value = '') {
  return encoder.encode(String(value)).byteLength;
}

export function newRecoveredId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Carga la biblioteca al arrancar con reintentos (503/429/5xx/red), respetando
 * `retryAfterMs`. Devuelve `{ok:true, payload}` o `{ok:false, error}`.
 */
export async function fetchDocsLibrary({fetchImpl, headers = {}, attempts = 4, sleep = sleepDefault, maxDelayMs = 8000} = {}) {
  const doFetch = fetchImpl || globalThis.fetch.bind(globalThis);
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let retryAfter = null;
    try {
      const response = await doFetch('/api/docs', {headers, cache: 'no-store'});
      if (response.ok) return {ok: true, payload: await response.json()};
      let data = null;
      try { data = await response.json(); } catch {}
      lastError = new HttpError(response.status, data);
      if (!isRetryableError(lastError)) return {ok: false, error: lastError};
      retryAfter = Number(data?.retryAfterMs);
    } catch (error) {
      lastError = error instanceof HttpError ? error : new HttpError(0, {error: 'network', message: NETWORK_ERROR_MESSAGE, detail: error?.message});
    }
    if (attempt < attempts - 1) {
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1000 * (2 ** attempt);
      await sleep(Math.min(maxDelayMs, delay));
    }
  }
  return {ok: false, error: lastError};
}
const MAX_BACKOFF_MS = 30_000;

export class HttpError extends Error {
  constructor(status, data = null) {
    super(data?.message || data?.error || `HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.data = data;
  }
}

export function isRetryableError(error) {
  const status = Number(error?.status ?? 0);
  if (!status) return true; // red / CORS / abortado
  return status === 429 || status >= 500;
}

/** Convierte un documento del API al formato del store del frontend. */
export function serverDocToLocal(item, {archived} = {}) {
  const isArchived = archived ?? (Boolean(item?.archived) || Boolean(item?.archivedAt));
  return {
    id: item.id,
    title: item.title || 'Sin título',
    description: item.description || '',
    body: markdownToHtml(item.markdown || '', item.title || ''),
    origin: item.sourceName ? 'Desde Discord' : 'Creado en Bardo',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    // Última versión confirmada por el servidor (base para detectar conflictos).
    serverUpdatedAt: item.updatedAt || null,
    createdByName: item.createdByName || null,
    updatedByName: item.updatedByName || item.createdByName || null,
    builtin: false,
    stress: false,
    sourceName: item.sourceName || null,
    sourceType: item.sourceType || 'markdown',
    importStatus: item.importStatus || 'ready',
    hasSource: Boolean(item.hasSource),
    archived: isArchived,
    archivedAt: item.archivedAt || null,
  };
}

export function toRemotePayload(doc) {
  const body = htmlToMarkdown(doc.body || '');
  const title = String(doc.title || 'Sin título').trim() || 'Sin título';
  return {
    id: doc.id,
    title,
    description: String(doc.description || '').trim(),
    markdown: `# ${title}\n\n${body}`.trim(),
  };
}

const signatureCache = new Map();

/** Firma del contenido sincronizable (título, descripción y Markdown). */
export function docSignature(doc) {
  const key = `${doc.title ?? ''}\u0000${doc.description ?? ''}\u0000${doc.body ?? ''}`;
  const cached = signatureCache.get(key);
  if (cached) return cached;
  const payload = toRemotePayload(doc);
  const value = JSON.stringify([payload.title, payload.description, payload.markdown]);
  if (signatureCache.size > 400) signatureCache.clear();
  signatureCache.set(key, value);
  return value;
}

function documentFrom(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.document && typeof data.document === 'object') return data.document;
  if (data.id) return data;
  return null;
}

export function errorMessage(error) {
  const status = Number(error?.status ?? 0);
  const code = error?.data?.error;
  if (!status) return 'Sin conexión, reintentando';
  if (status === 401) return 'Tu sesión de Discord expiró. Vuelve a abrir Bardo para guardar.';
  if (status === 403) return 'No tienes permiso para guardar este documento en este canal.';
  if (status === 413) return 'El documento supera el tamaño máximo permitido.';
  if (status === 409 && code === 'import_pending') return 'El archivo aún se está procesando. Reintentaremos en unos segundos.';
  if (status === 400) return error?.data?.message || 'El servidor rechazó el documento.';
  if (status === 429 || status >= 500) return 'Sin conexión, reintentando';
  return error?.data?.message || `No se pudo guardar (HTTP ${status}).`;
}

/**
 * Mensaje en español para mostrar al usuario ante un error de una acción
 * (publicar, eliminar, exportar…). Nunca expone "Failed to fetch" ni "HTTP 500".
 */
export function userFacingError(error, fallback = 'No se pudo completar la acción. Intenta de nuevo.') {
  if (!error || typeof error !== 'object' || !('status' in error)) return fallback;
  const status = Number(error.status ?? 0);
  if (!status) return NETWORK_ERROR_MESSAGE;
  if (status === 401) return 'Tu sesión de Discord expiró. Cierra y vuelve a abrir Bardo.';
  if (status === 429 || status >= 500) return 'Bardo no responde en este momento. Intenta de nuevo en unos segundos.';
  const message = error.data?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

/** Entrada de cola de un documento que nunca llegó al servidor. */
export function isNeverCreated(entry) {
  return String(entry?.doc?.id || '').startsWith('local-') && !entry?.baseUpdatedAt;
}

/**
 * Documento de la copia local que nunca se confirmó en el servidor (nuevo, o
 * una copia cuyo `serverUpdatedAt` heredado es anterior a su creación).
 */
export function isUnsavedLocalDoc(doc) {
  if (!String(doc?.id || '').startsWith('local-')) return false;
  if (!doc.serverUpdatedAt) return true;
  const created = Date.parse(doc.createdAt || '');
  const confirmed = Date.parse(doc.serverUpdatedAt || '');
  return Number.isFinite(created) && Number.isFinite(confirmed) && confirmed < created;
}

/**
 * Crea la función `request` usada por el motor.
 * @param {{fetchImpl?: typeof fetch, getHeaders?: () => Record<string,string>}} options
 */
export function createApiRequest({fetchImpl, getHeaders = () => ({})} = {}) {
  return async function request(path, {method = 'GET', body, keepalive = false} = {}) {
    const doFetch = fetchImpl || globalThis.fetch.bind(globalThis);
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    let response;
    try {
      response = await doFetch(path, {
        method,
        headers: {'Content-Type': 'application/json', Accept: 'application/json', ...getHeaders()},
        body: serialized,
        cache: 'no-store',
        keepalive: Boolean(keepalive && (!serialized || utf8Bytes(serialized) <= KEEPALIVE_MAX_BYTES)),
      });
    } catch (error) {
      throw new HttpError(0, {error: 'network', message: NETWORK_ERROR_MESSAGE, detail: error?.message});
    }
    let data = null;
    if (response.status !== 204) {
      try { data = await response.json(); } catch { data = null; }
    }
    if (!response.ok) throw new HttpError(response.status, data);
    return data;
  };
}

/**
 * @param {{
 *   request: (path: string, init?: object) => Promise<any>,
 *   storage?: {getItem(key:string):string|null, setItem(key:string, value:string):void},
 *   emit?: (detail: {scope:'docs', id:string, state:string, message?:string}) => void,
 *   onRemote?: (event: object) => void,
 *   setTimer?: (fn: Function, ms: number) => any,
 *   clearTimer?: (handle: any) => void,
 * }} options
 */
export function createDocsSync({
  request,
  storage = null,
  emit = () => {},
  onRemote = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = handle => clearTimeout(handle),
  pendingKey = DOCS_PENDING_KEY,
  legacyPendingKey = null,
} = {}) {
  /** id -> {sig, updatedAt, archived, importStatus} confirmado por el servidor */
  const remote = new Map();
  /** id -> {doc, baseUpdatedAt, version, failed, legacy?, checklistOps?} */
  const pending = new Map();
  /** Entradas antiguas sin ámbito que no pertenecen (o aún no) a este canal. */
  const parked = new Map();
  const hasLegacyQueue = Boolean(legacyPendingKey && legacyPendingKey !== pendingKey);
  const states = new Map();
  const conflicted = new Set();
  /** id -> firmas que este cliente ya envió (para reconocer sus propias escrituras) */
  const sentSigs = new Map();
  /** documentos reemplazados por una copia nueva (403): no volver a encolarlos */
  const abandoned = new Set();
  /** id -> versión ya enviada con keepalive */
  const keepaliveSent = new Map();
  let running = null;
  let rerun = false;
  let retryTimer = null;
  let retryAttempt = 0;
  let blocked = false; // 401: no reintentar hasta la próxima sesión
  let storageWarned = false;
  let keepaliveMode = false;

  function setState(id, state, message) {
    states.set(id, {state, message});
    emit({scope: 'docs', id, state, ...(message ? {message} : {})});
  }

  function serializeEntry(entry) {
    return {
      doc: entry.doc,
      baseUpdatedAt: entry.baseUpdatedAt ?? null,
      version: entry.version,
      failed: entry.failed || null,
      ...(entry.recreatedFrom ? {recreatedFrom: entry.recreatedFrom} : {}),
      ...(entry.legacy ? {legacy: true} : {}),
      ...(entry.checklistOps?.length
        ? {checklistOps: entry.checklistOps, checklistSig: entry.checklistSig, checklistVersion: entry.checklistVersion}
        : {}),
    };
  }

  function writeQueue(key, map) {
    const entries = {};
    map.forEach((entry, id) => { entries[id] = serializeEntry(entry); });
    try {
      storage.setItem(key, JSON.stringify({version: 1, entries}));
      return true;
    } catch (error) {
      if (!storageWarned) {
        storageWarned = true;
        onRemote({type: 'storage-warning', error});
      }
      return false;
    }
  }

  function persist() {
    if (!storage) return true;
    return writeQueue(pendingKey, pending);
  }

  function persistParked() {
    if (!storage || !hasLegacyQueue) return true;
    return writeQueue(legacyPendingKey, parked);
  }

  function readQueue(key, target, extra = {}) {
    try {
      const parsed = JSON.parse(storage.getItem(key) || 'null');
      if (parsed?.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
        Object.entries(parsed.entries).forEach(([id, entry]) => {
          if (!entry?.doc?.id) return;
          target.set(id, {
            doc: entry.doc,
            baseUpdatedAt: entry.baseUpdatedAt ?? null,
            version: Number(entry.version) || 1,
            // En un arranque nuevo se reintenta todo una vez, incluso lo que falló.
            failed: null,
            ...(entry.recreatedFrom ? {recreatedFrom: entry.recreatedFrom} : {}),
            ...(entry.legacy || extra.legacy ? {legacy: true} : {}),
            ...(Array.isArray(entry.checklistOps) && entry.checklistOps.length
              ? {checklistOps: entry.checklistOps, checklistSig: entry.checklistSig, checklistVersion: Number(entry.version) || 1}
              : {}),
          });
        });
      }
    } catch {}
  }

  /**
   * Una entrada antigua (sin ámbito) se adopta en este canal si:
   * - el documento nunca llegó al servidor (se crea aquí, como el borrador), o
   * - el documento del servidor pertenece a este canal (lista o copia local).
   * Devuelve los ids adoptados.
   */
  function adoptParked() {
    const adopted = [];
    parked.forEach((entry, id) => {
      if (pending.has(id)) {
        parked.delete(id);
        return;
      }
      if (isNeverCreated(entry)) {
        parked.delete(id);
        // Ya es de este canal: se crea con POST como cualquier documento nuevo.
        const {legacy: _legacy, ...rest} = entry;
        pending.set(id, {...rest, failed: null});
        adopted.push(id);
        return;
      }
      if (!remote.has(id)) return;
      parked.delete(id);
      pending.set(id, {...entry, legacy: true, failed: null});
      adopted.push(id);
    });
    if (adopted.length) {
      persist();
      persistParked();
      onRemote({type: 'parked-changed'});
    }
    return adopted;
  }

  /**
   * Carga la cola. `legacyDocs` son los documentos de la copia global antigua
   * de la biblioteca: los que nunca llegaron al servidor y no están en ninguna
   * cola se suman a la cola antigua para no perderlos. Devuelve si la cola
   * antigua quedó guardada (solo entonces se puede borrar la copia global).
   */
  function loadPending({legacyDocs = []} = {}) {
    if (!storage) return true;
    readQueue(pendingKey, pending);
    if (!hasLegacyQueue) return true;
    readQueue(legacyPendingKey, parked, {legacy: true});
    let added = false;
    legacyDocs.forEach(doc => {
      if (!doc?.id || pending.has(doc.id) || parked.has(doc.id) || !isUnsavedLocalDoc(doc)) return;
      parked.set(doc.id, {doc, baseUpdatedAt: null, version: 1, failed: null, legacy: true});
      added = true;
    });
    const saved = added ? persistParked() : true;
    adoptParked();
    return saved;
  }

  /** Resumen de lo estacionado (de otro canal) para mostrarlo al usuario. */
  function parkedSummary() {
    return [...parked.values()].map(entry => ({
      id: entry.doc.id,
      title: String(entry.doc.title || '').trim() || 'Sin título',
    }));
  }

  /**
   * "Reintentar": consulta cada documento estacionado; si este canal tiene
   * acceso, se adopta y se envía. Devuelve cuántos siguen estacionados.
   */
  async function retryParked() {
    const before = [...parked.keys()];
    for (const id of before) {
      try {
        const item = documentFrom(await request(`/api/docs/${encodeURIComponent(id)}`));
        if (item?.id) {
          abandoned.delete(id);
          registerRemote([item]);
        }
      } catch {
        // 403/404/red: sigue estacionado, sin perderse.
      }
    }
    adoptParked();
    const adopted = before.filter(id => !parked.has(id) && pending.has(id));
    // Mostrarlos en la biblioteca de este canal mientras se envían.
    if (adopted.length) onRemote({type: 'refresh', docs: adopted.map(id => pending.get(id)?.doc).filter(Boolean)});
    if (pending.size) schedule(0);
    return parked.size;
  }

  /** "Descartar": el usuario decide borrar los cambios estacionados. */
  function discardParked() {
    if (!parked.size) return 0;
    const count = parked.size;
    parked.clear();
    persistParked();
    onRemote({type: 'parked-changed'});
    return count;
  }

  /** Devuelve una entrada antigua a la cola estacionada (sin perderla). */
  function park(id, entry, message) {
    pending.delete(id);
    // Sin acceso desde este canal: no volver a encolarlo aquí (ni como nuevo).
    abandoned.add(id);
    if (hasLegacyQueue) parked.set(id, {...entry, legacy: true, failed: null});
    persist();
    persistParked();
    setState(id, 'error', message || 'Este cambio pertenece a otro canal. Lo guardamos en este dispositivo y se enviará al abrir Bardo en ese canal.');
    onRemote({type: 'parked-changed', id});
    return 'done';
  }

  function registerRemote(items = [], {archived} = {}) {
    items.forEach(item => {
      if (!item?.id) return;
      const local = serverDocToLocal(item, {archived});
      remote.set(item.id, {
        sig: docSignature(local),
        updatedAt: item.updatedAt || null,
        archived: local.archived,
        importStatus: local.importStatus,
      });
    });
    if (parked.size) adoptParked();
  }

  /**
   * Arranque sin conexión: usa la copia local de la biblioteca como último
   * estado conocido del servidor, para no reenviarla como documentos nuevos.
   */
  function registerCached(docs = []) {
    docs.forEach(doc => {
      if (!doc?.id || remote.has(doc.id) || String(doc.id).startsWith('local-') && !doc.serverUpdatedAt) return;
      remote.set(doc.id, {
        sig: docSignature(doc),
        updatedAt: doc.serverUpdatedAt || null,
        archived: Boolean(doc.archived),
        importStatus: doc.importStatus || 'ready',
      });
    });
  }

  /** Superpone las ediciones pendientes (no confirmadas) sobre los documentos del servidor. */
  function overlayPending(docs = []) {
    const byId = new Map(docs.map(doc => [doc.id, doc]));
    const result = docs.map(doc => (pending.has(doc.id) ? {...doc, ...pending.get(doc.id).doc} : doc));
    pending.forEach((entry, id) => {
      if (!byId.has(id)) result.unshift(entry.doc);
    });
    return result;
  }

  function needsWork(doc) {
    const r = remote.get(doc.id);
    if (!r) return true;
    const contentChanged = doc.importStatus !== 'pending' && r.importStatus !== 'pending' && docSignature(doc) !== r.sig;
    return contentChanged || Boolean(doc.archived) !== Boolean(r.archived);
  }

  /** Registra el estado actual del store; encola lo que difiere del servidor. */
  function track(store) {
    const docs = Array.isArray(store?.docs) ? store.docs : [];
    let changed = false;
    docs.forEach(doc => {
      if (!doc?.id || abandoned.has(doc.id)) return;
      if (conflicted.has(doc.id)) {
        // Esperando que la app adopte la versión del servidor: no sobrescribir.
        const r = remote.get(doc.id);
        if (r && docSignature(doc) === r.sig) conflicted.delete(doc.id);
        else return;
      }
      const entry = pending.get(doc.id);
      if (entry) {
        if (entry.doc !== doc) {
          entry.doc = doc;
          entry.version += 1;
          entry.failed = null;
          changed = true;
        }
        return;
      }
      if (!needsWork(doc)) return;
      pending.set(doc.id, {doc, baseUpdatedAt: remote.get(doc.id)?.updatedAt ?? null, version: 1, failed: null});
      changed = true;
      setState(doc.id, 'saving');
    });
    if (changed) {
      persist();
      schedule(0);
    }
  }

  /**
   * Encola una edición recuperada (p. ej. de la copia local de seguridad) con la
   * base sobre la que el usuario editó, para detectar conflictos correctamente.
   */
  function enqueue(doc, {baseUpdatedAt} = {}) {
    if (!doc?.id) return;
    const entry = pending.get(doc.id);
    if (entry) {
      entry.doc = doc;
      entry.version += 1;
      entry.failed = null;
    } else {
      pending.set(doc.id, {
        doc,
        baseUpdatedAt: baseUpdatedAt ?? remote.get(doc.id)?.updatedAt ?? null,
        version: 1,
        failed: null,
      });
      setState(doc.id, 'saving');
    }
    persist();
    schedule(0);
  }

  function baseFor(id) {
    return pending.get(id)?.baseUpdatedAt ?? remote.get(id)?.updatedAt ?? null;
  }

  function schedule(delay) {
    if (blocked) return;
    if (retryTimer) {
      if (delay > 0) return;
      clearTimer(retryTimer);
      retryTimer = null;
    }
    if (delay <= 0) {
      Promise.resolve().then(() => flush());
      return;
    }
    retryTimer = setTimer(() => {
      retryTimer = null;
      flush();
    }, delay);
  }

  function scheduleRetry(error) {
    const hinted = Number(error?.data?.retryAfterMs);
    const delay = Number.isFinite(hinted) && hinted > 0
      ? Math.min(MAX_BACKOFF_MS, hinted)
      : Math.min(MAX_BACKOFF_MS, 1000 * (2 ** retryAttempt));
    retryAttempt += 1;
    schedule(delay);
  }

  function rememberSent(id, sig) {
    let set = sentSigs.get(id);
    if (!set) {
      set = new Set();
      sentSigs.set(id, set);
    }
    set.add(sig);
    if (set.size > 20) set.delete(set.values().next().value);
  }

  function isOwnWrite(id, serverSig) {
    return Boolean(sentSigs.get(id)?.has(serverSig));
  }

  /**
   * 403 al guardar: conservar el trabajo como documento nuevo (una sola vez).
   * Solo para entradas de este canal; las antiguas sin ámbito se estacionan.
   */
  function recreateAsNew(id, entry) {
    if (entry.legacy) {
      return park(id, entry, 'No tienes acceso a este documento desde este canal. Tus cambios quedan guardados en este dispositivo.');
    }
    pending.delete(id);
    abandoned.add(id);
    remote.delete(id);
    if (entry.recreatedFrom) {
      // Ya era una copia recreada: no encadenar más copias.
      persist();
      setState(id, 'error', 'No tienes permiso para guardar este documento en este canal.');
      return 'done';
    }
    const newId = newRecoveredId();
    const doc = {...entry.doc, id: newId, archived: false, archivedAt: null, importStatus: 'ready', hasSource: false};
    pending.set(newId, {doc, baseUpdatedAt: null, version: 1, failed: null, recreatedFrom: id});
    persist();
    setState(id, 'error', 'No tenías acceso a ese documento; guardamos tus cambios como un documento nuevo.');
    onRemote({type: 'recreated', oldId: id, newId, doc});
    return 'again';
  }

  async function processEntry(id, entry) {
    const version = entry.version;
    const doc = entry.doc;
    setState(id, 'saving');

    let r = remote.get(id);
    const sig = docSignature(doc);

    // Una entrada antigua sin ámbito nunca se crea en el canal actual.
    if (!r && entry.legacy) return park(id, entry);

    if (!r) {
      const payload = toRemotePayload(doc);
      rememberSent(id, sig);
      try {
        const data = await request('/api/docs', {method: 'POST', body: payload, keepalive: keepaliveMode});
        const created = documentFrom(data);
        r = {sig, updatedAt: created?.updatedAt || null, archived: false, importStatus: 'ready'};
        remote.set(id, r);
        entry.baseUpdatedAt = r.updatedAt;
        if (created) onRemote({type: 'saved', id, document: created});
      } catch (error) {
        if (error?.status === 409 && documentFrom(error.data)) {
          const existing = documentFrom(error.data);
          registerRemote([existing]);
          r = remote.get(id);
          if (r.sig !== sig) {
            // Sin base (nuestro POST anterior llegó pero se perdió la respuesta),
            // base igual a la del servidor o contenido que nosotros mismos
            // enviamos: no es un conflicto, seguimos con PATCH sobre esa versión.
            const ours = !entry.baseUpdatedAt || entry.baseUpdatedAt === r.updatedAt || isOwnWrite(id, r.sig);
            if (!ours) return conflict(id, entry, existing);
            entry.baseUpdatedAt = r.updatedAt;
          } else {
            entry.baseUpdatedAt = r.updatedAt;
          }
        } else {
          throw error;
        }
      }
    }

    if (doc.importStatus !== 'pending' && r.importStatus !== 'pending' && r.sig !== sig) {
      const payload = toRemotePayload(doc);
      const baseUpdatedAt = entry.baseUpdatedAt ?? r.updatedAt ?? undefined;
      rememberSent(id, sig);
      try {
        const data = await request(`/api/docs/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: {...payload, ...(baseUpdatedAt ? {baseUpdatedAt} : {})},
          keepalive: keepaliveMode,
        });
        const saved = documentFrom(data);
        r = {...r, sig, updatedAt: saved?.updatedAt || r.updatedAt};
        remote.set(id, r);
        entry.baseUpdatedAt = r.updatedAt;
        if (saved) onRemote({type: 'saved', id, document: saved});
      } catch (error) {
        if (error?.status === 409 && error.data?.error === 'conflict') {
          const current = documentFrom(error.data);
          if (current) {
            const currentSig = docSignature(serverDocToLocal(current));
            if (currentSig === sig || isOwnWrite(id, currentSig)) {
              // El servidor ya tiene una escritura nuestra (p. ej. un envío con
              // keepalive o una respuesta perdida): adoptar su versión como base.
              registerRemote([current]);
              entry.baseUpdatedAt = current.updatedAt || null;
              return 'again';
            }
          }
          if (isChecklistOnly(entry)) return rebaseChecklist(id, entry, current);
          return conflict(id, entry, current);
        }
        if (error?.status === 403) {
          return recreateAsNew(id, entry);
        }
        if (error?.status === 404) {
          if (entry.legacy) return park(id, entry);
          // Ya no existe en el servidor: recrearlo para no perder el contenido.
          remote.delete(id);
          entry.baseUpdatedAt = null;
          return 'again';
        }
        throw error;
      }
    }

    if (Boolean(doc.archived) !== Boolean(r.archived)) {
      let changed = null;
      try {
        const data = doc.archived
          ? await request(`/api/docs/${encodeURIComponent(id)}`, {method: 'DELETE', keepalive: keepaliveMode})
          : await request(`/api/docs/${encodeURIComponent(id)}/restore`, {method: 'POST', keepalive: keepaliveMode});
        changed = data?.document && typeof data.document === 'object' ? data.document : null;
      } catch (error) {
        if (error?.status === 403) {
          // Sin permiso: deshacer el cambio local para no mostrar un estado falso.
          pending.delete(id);
          persist();
          setState(id, 'error', doc.archived
            ? 'No tienes permiso para archivar este documento en este canal.'
            : 'No tienes permiso para restaurar este documento en este canal.');
          onRemote({type: 'archive-failed', id, archived: Boolean(r.archived)});
          return 'done';
        }
        if (error?.status !== 404) throw error;
      }
      // Archivar/restaurar cambia updatedAt en el servidor: adoptarlo para que
      // el próximo PATCH no sea un conflicto falso.
      r = {...r, archived: Boolean(doc.archived), updatedAt: changed?.updatedAt || r.updatedAt};
      remote.set(id, r);
      if (changed?.updatedAt) entry.baseUpdatedAt = changed.updatedAt;
    }

    if (pending.get(id) === entry && entry.version === version) {
      pending.delete(id);
      persist();
      setState(id, 'saved');
      return 'done';
    }
    // Llegaron cambios durante el envío: las tareas ya enviadas no deben volver
    // a "reaplicarse" sobre texto nuevo; si lo pendiente no es solo tareas,
    // cualquier 409 posterior va por el camino normal de conflicto.
    if (entry.checklistOps?.length && !isChecklistOnly(entry)) clearChecklist(entry);
    persist();
    return 'again';
  }

  /**
   * ¿La entrada solo contiene tareas marcadas en el lector (sin otras
   * ediciones)? Se exige la misma versión registrada al marcar: cualquier
   * cambio posterior (texto, guardados) la invalida y va por el camino normal.
   */
  function isChecklistOnly(entry) {
    return Boolean(entry.checklistOps?.length)
      && entry.checklistVersion === entry.version
      && entry.checklistSig === docSignature(entry.doc);
  }

  function clearChecklist(entry) {
    delete entry.checklistOps;
    delete entry.checklistSig;
    delete entry.checklistVersion;
  }

  /**
   * 409 tras marcar tareas: reaplicar solo esas tareas sobre la versión del
   * servidor y volver a enviar (máx. MAX_CHECKLIST_REBASES). Nunca crea copias.
   */
  async function rebaseChecklist(id, entry, serverDocument) {
    let current = serverDocument;
    if (!current) {
      try {
        current = documentFrom(await request(`/api/docs/${encodeURIComponent(id)}`));
      } catch {
        current = null;
      }
      // Si mientras tanto llegaron otras ediciones, ya no son solo tareas.
      if (!isChecklistOnly(entry)) return conflict(id, entry, current);
    }
    entry.rebaseAttempts = (entry.rebaseAttempts || 0) + 1;
    const serverLocal = current ? serverDocToLocal(current) : null;
    const body = serverLocal ? applyChecklistOps(serverLocal.body, entry.checklistOps) : null;
    if (!current || body === null || entry.rebaseAttempts > MAX_CHECKLIST_REBASES) {
      pending.delete(id);
      persist();
      if (current) {
        registerRemote([current]);
        conflicted.add(id);
      }
      setState(id, 'error', 'Otra persona cambió este documento al mismo tiempo y no pudimos guardar la tarea. Revisa la lista y vuelve a marcarla.');
      if (serverLocal) onRemote({type: 'replace', docs: [serverLocal]});
      return 'conflict';
    }
    registerRemote([current]);
    const rebased = {
      ...entry.doc,
      title: serverLocal.title,
      description: serverLocal.description,
      body,
      updatedAt: serverLocal.updatedAt,
      serverUpdatedAt: serverLocal.serverUpdatedAt,
      updatedByName: serverLocal.updatedByName,
    };
    entry.doc = rebased;
    entry.version += 1;
    entry.failed = null;
    entry.baseUpdatedAt = current.updatedAt || null;
    entry.checklistSig = docSignature(rebased);
    onRemote({type: 'replace', docs: [rebased]});
    // La app adopta la versión combinada (eso sube la versión): sigue siendo
    // solo tareas si el contenido no cambió.
    if (docSignature(entry.doc) === entry.checklistSig) entry.checklistVersion = entry.version;
    else clearChecklist(entry);
    persist();
    return 'again';
  }

  /**
   * Registra que el último cambio de `id` fue marcar una tarea en el lector.
   * `prevDoc` es el documento justo antes del cambio; solo se acepta si no hay
   * otras ediciones sin enviar mezcladas.
   */
  function noteChecklistToggle(id, op, prevDoc) {
    const entry = pending.get(id);
    if (!entry || !op || !Number.isInteger(Number(op.index))) return false;
    const prevSig = prevDoc ? docSignature(prevDoc) : null;
    const normalized = {index: Number(op.index), done: Boolean(op.done)};
    // `entry.version - 1`: la versión justo antes de esta tarea (track la subió).
    const continuing = entry.checklistOps?.length
      && entry.checklistSig === prevSig
      && entry.checklistVersion === entry.version - 1;
    if (continuing) {
      entry.checklistOps = [...entry.checklistOps, normalized];
    } else if (!entry.checklistOps?.length && prevSig && remote.get(id)?.sig === prevSig) {
      entry.checklistOps = [normalized];
      entry.rebaseAttempts = 0;
    } else {
      clearChecklist(entry);
      persist();
      return false;
    }
    entry.checklistSig = docSignature(entry.doc);
    entry.checklistVersion = entry.version;
    persist();
    return true;
  }

  function conflict(id, entry, serverDocument) {
    pending.delete(id);
    persist();
    if (serverDocument) registerRemote([serverDocument]);
    conflicted.add(id);
    setState(id, 'conflict', 'Otra persona editó este documento. Guardamos tu versión como copia.');
    onRemote({
      type: 'conflict',
      id,
      localDoc: entry.doc,
      serverDoc: serverDocument ? serverDocToLocal(serverDocument) : null,
    });
    return 'conflict';
  }

  function markSaved(id, entry, version, sig, saved) {
    const r = remote.get(id) || {archived: false, importStatus: 'ready'};
    remote.set(id, {...r, sig, updatedAt: saved?.updatedAt || r.updatedAt || null});
    entry.baseUpdatedAt = saved?.updatedAt || entry.baseUpdatedAt;
    if (saved) onRemote({type: 'saved', id, document: saved});
    if (pending.get(id) === entry && entry.version === version && Boolean(entry.doc.archived) === Boolean(remote.get(id).archived)) {
      pending.delete(id);
      persist();
      setState(id, 'saved');
    }
  }

  /**
   * Envío inmediato al cerrar/ocultar la página: cada cambio pendiente sale con
   * `keepalive` sin esperar a la cola (que puede tener una petición normal en
   * curso que el navegador abortará). Lo que no quepa en ~60 KB queda pendiente
   * (cola persistida + copia local) para el próximo arranque.
   */
  function flushKeepalive() {
    persist();
    if (blocked) return 0;
    let budget = KEEPALIVE_MAX_BYTES;
    let sent = 0;
    pending.forEach((entry, id) => {
      if (entry.failed || keepaliveSent.get(id) === entry.version) return;
      const doc = entry.doc;
      const r = remote.get(id);
      const sig = docSignature(doc);
      let path;
      let method;
      let body;
      if (!r && entry.legacy) {
        return;
      } else if (!r) {
        path = '/api/docs';
        method = 'POST';
        body = toRemotePayload(doc);
      } else if (doc.importStatus !== 'pending' && r.importStatus !== 'pending' && r.sig !== sig) {
        const baseUpdatedAt = entry.baseUpdatedAt ?? r.updatedAt ?? undefined;
        path = `/api/docs/${encodeURIComponent(id)}`;
        method = 'PATCH';
        body = {...toRemotePayload(doc), ...(baseUpdatedAt ? {baseUpdatedAt} : {})};
      } else if (Boolean(doc.archived) !== Boolean(r.archived)) {
        path = doc.archived ? `/api/docs/${encodeURIComponent(id)}` : `/api/docs/${encodeURIComponent(id)}/restore`;
        method = doc.archived ? 'DELETE' : 'POST';
      } else {
        return;
      }
      const bytes = body === undefined ? 0 : utf8Bytes(JSON.stringify(body));
      if (bytes > budget) return;
      budget -= bytes;
      sent += 1;
      const version = entry.version;
      keepaliveSent.set(id, version);
      if (body) rememberSent(id, sig);
      request(path, {method, body, keepalive: true}).then(data => {
        if (method === 'DELETE' || (method === 'POST' && path.endsWith('/restore'))) {
          const current = remote.get(id);
          if (current) remote.set(id, {...current, archived: Boolean(doc.archived), updatedAt: documentFrom(data)?.updatedAt || current.updatedAt});
          markSaved(id, entry, version, remote.get(id)?.sig ?? sig, null);
          return;
        }
        markSaved(id, entry, version, sig, documentFrom(data));
      }).catch(() => {
        // Si la página sigue viva, la cola normal reintenta y resuelve conflictos.
        keepaliveSent.delete(id);
      });
    });
    return sent;
  }

  async function runQueue() {
    do {
      rerun = false;
      for (const [id, entry] of [...pending]) {
        if (entry.failed || blocked) continue;
        let outcome;
        try {
          outcome = await processEntry(id, entry);
          retryAttempt = 0;
        } catch (error) {
          if (error?.status === 401) {
            blocked = true;
            setState(id, 'error', errorMessage(error));
            return;
          }
          if (isRetryableError(error) || (error?.status === 409 && error?.data?.error === 'import_pending')) {
            setState(id, error?.status === 409 ? 'error' : 'offline', errorMessage(error));
            scheduleRetry(error);
            return;
          }
          entry.failed = error?.status || 'error';
          persist();
          setState(id, 'error', errorMessage(error));
          continue;
        }
        if (outcome === 'again') rerun = true;
      }
    } while (rerun);
  }

  function flush({keepalive = false} = {}) {
    if (keepalive) keepaliveMode = true;
    if (running) {
      rerun = true;
      return running;
    }
    running = runQueue().finally(() => {
      running = null;
      keepaliveMode = false;
    });
    return running;
  }

  /** Espera a que la cola termine y dice si el documento quedó guardado. */
  async function settle(id) {
    if (blocked) return !pending.has(id);
    await flush();
    if (running) await running;
    return !pending.has(id);
  }

  function stateFor(id) {
    if (pending.has(id)) {
      const current = states.get(id);
      return current && current.state !== 'saved' ? current : {state: 'saving'};
    }
    const current = states.get(id);
    if (current?.state === 'conflict' || current?.state === 'error') return current;
    return {state: 'saved'};
  }

  function forget(id) {
    abandoned.delete(id);
    pending.delete(id);
    remote.delete(id);
    conflicted.delete(id);
    states.delete(id);
    persist();
    if (parked.delete(id)) persistParked();
  }

  return {
    remote,
    pending,
    parked,
    parkedSummary,
    retryParked,
    discardParked,
    loadPending,
    registerRemote,
    registerCached,
    overlayPending,
    track,
    enqueue,
    flushKeepalive,
    baseFor,
    flush,
    settle,
    stateFor,
    forget,
    noteChecklistToggle,
    retryNow() {
      retryAttempt = 0;
      if (retryTimer) {
        clearTimer(retryTimer);
        retryTimer = null;
      }
      return flush();
    },
  };
}
