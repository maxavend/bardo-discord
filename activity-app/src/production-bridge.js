import {markdownToHtml} from './editor/bardo-markdown.js';
import {
  DOCS_STORE_KEY as STORE_KEY,
  DOCS_PENDING_KEY,
  HttpError,
  createApiRequest,
  createDocsSync,
  fetchDocsLibrary,
  serverDocToLocal,
  userFacingError,
} from './production-docs-sync.js';
import {normalizePendingImports} from './production-import-normalizer.js';
import {
  DOCS_KEYS,
  adoptLegacyDocsValue,
  docsScopeFor,
  scopedDocsKey,
  setDocsStorageScope,
} from './docs-storage.js';

export {markdownToHtml};

const PLANNER_STORE_KEY = 'bardo-planner-session-state-v1';
const LIVE_SESSION_STORE_KEY = 'bardo-planner-live-session-v1';
const FALLBACK_CLIENT_ID = '1539704001535156254';
/** Destinos de lanzamiento que no son un documento. */
const SPECIAL_LAUNCH_TARGETS = new Set(['docs', 'planner', 'new-doc']);

function responseFileName(response, fallback) {
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch {}
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallback;
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/** Copia global antigua (sin ámbito) de la biblioteca, solo para rescatar documentos sin enviar. */
function readLegacyCacheDocs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DOCS_KEYS.store) || 'null');
    return Array.isArray(parsed?.docs) ? parsed.docs.filter(doc => doc?.id) : [];
  } catch {
    return [];
  }
}

/** Copia local de la biblioteca de ESTE canal (nunca la de otro canal). */
function readCachedDocs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedDocsKey(STORE_KEY)) || 'null');
    return Array.isArray(parsed?.docs) ? parsed.docs.filter(doc => doc?.id) : [];
  } catch {
    return [];
  }
}

function readImportFailures() {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedDocsKey(DOCS_KEYS.importFailures)) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeImportFailures(failures) {
  try {
    localStorage.setItem(scopedDocsKey(DOCS_KEYS.importFailures), JSON.stringify(failures));
  } catch {}
}

/**
 * Destino de un lanzamiento ("bardo:open:<destino>"): un documento a leer, uno a
 * editar (`edit:<id>`, tarjeta de /doc-new) o una sección.
 */
export function parseDocsLaunchTarget(target) {
  const value = String(target || '').trim();
  if (!value) return {type: 'none'};
  if (value.startsWith('edit:')) {
    const id = value.slice('edit:'.length).trim();
    return id ? {type: 'edit', id} : {type: 'none'};
  }
  if (SPECIAL_LAUNCH_TARGETS.has(value) || value.startsWith('new-doc:') || value.startsWith('planner')) {
    return {type: 'section', target: value};
  }
  if (value.includes(':')) return {type: 'none'};
  return {type: 'doc', id: value};
}

function resolveClientId() {
  const host = window.location.hostname || '';
  const match = host.match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i);
  return match?.[1] || FALLBACK_CLIENT_ID;
}

async function initSdk() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('instance_id')) return null;
  try {
    const {DiscordSDK} = await import('@discord/embedded-app-sdk');
    const sdk = new DiscordSDK(resolveClientId());
    await sdk.ready();
    return sdk;
  } catch (error) {
    console.warn('Bardo Docs: Discord SDK no disponible', error);
    return null;
  }
}

/**
 * Where a Discord "Abrir reunión" button (custom_id planner-session:<id>)
 * lands: that meeting's agenda when it is the one loaded, otherwise the
 * meetings list (e.g. the meeting was archived or deleted meanwhile).
 */
export function plannerSessionLaunchHash(requestedId, openedPlannerId) {
  return requestedId && openedPlannerId && requestedId === openedPlannerId ? '#planner-agenda' : '#planner';
}

/**
 * Tarjetas antiguas "/doc-new titulo:..." llevan el título en el custom_id. Se
 * usa como título del borrador nuevo, pero nunca pisa un borrador con título o
 * contenido (se perdería trabajo): en ese caso devuelve false y la app ofrece
 * "Continuar borrador" / "Empezar uno nuevo".
 */
export function prefillNewDocTitle(rawTitle, storage = globalThis.localStorage, key = scopedDocsKey(DOCS_KEYS.draft)) {
  const title = String(rawTitle || '').trim();
  if (!title || !storage) return false;
  try {
    const draft = JSON.parse(storage.getItem(key) || 'null');
    const body = String(draft?.body || '').replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/gi, '').trim();
    if (draft?.title?.trim() || draft?.description?.trim() || body) return false;
    storage.setItem(key, JSON.stringify({
      title,
      description: '',
      body: '<p><br></p>',
      updatedAt: new Date().toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}

export async function prepareBardoProduction(options = {}) {
  const instanceId = options.instanceId
    || window.__BARDO_INSTANCE_ID__
    || new URLSearchParams(window.location.search).get('instance_id')?.trim()
    || null;

  window.__BARDO_PRODUCTION__ = true;
  if (instanceId) window.__BARDO_INSTANCE_ID__ = instanceId;

  const sdk = options.sdk || window.__BARDO_DISCORD_SDK__ || await initSdk();
  if (sdk) window.__BARDO_DISCORD_SDK__ = sdk;

  // Todo lo que Documentos guarda en este dispositivo queda separado por
  // servidor + canal: un borrador o un cambio sin enviar de un canal (incluso
  // privado) nunca aparece ni se publica en otro.
  const docsScope = setDocsStorageScope(docsScopeFor(
    options.guildId || window.__BARDO_GUILD_ID__,
    options.channelId || window.__BARDO_CHANNEL_ID__,
  ));
  // La copia global antigua de la biblioteca (de antes de separar por canal)
  // puede tener documentos que nunca llegaron al servidor: se rescatan en la
  // cola antigua y la copia se borra SOLO cuando quedaron guardados ahí.
  let legacyCacheDocs = [];
  if (docsScope) {
    adoptLegacyDocsValue(localStorage, DOCS_KEYS.draft, docsScope);
    legacyCacheDocs = readLegacyCacheDocs();
    try { localStorage.removeItem(DOCS_KEYS.lastOpened); } catch {}
  }

  const headers = {'Accept':'application/json'};
  if (window.__BARDO_SESSION_TOKEN__) headers['Authorization'] = `Bearer ${window.__BARDO_SESSION_TOKEN__}`;
  if (window.__BARDO_CUSTOM_ID__) headers['x-bardo-custom-id'] = window.__BARDO_CUSTOM_ID__;
  if (instanceId) headers['x-bardo-instance-id'] = instanceId;

  let payload = options.initialDocsPayload || {documents:[], contextDocumentId:null};
  // Si la biblioteca no se puede cargar (503 de Discord, red), NO se borra la
  // copia local: se arranca con ella y se reintenta en segundo plano.
  let libraryLoaded = Boolean(options.initialDocsPayload);
  if (!options.initialDocsPayload) {
    const result = await fetchDocsLibrary({headers});
    if (result.ok) {
      payload = result.payload;
      libraryLoaded = true;
    } else {
      console.warn('Bardo Docs: no se pudo hidratar la biblioteca', result.error);
    }
  }

  // Slash commands (/bardo) and some mobile clients launch without a
  // custom_id; the server then returns the destination saved by the
  // interaction. An explicit custom_id always wins.
  if (!window.__BARDO_CUSTOM_ID__ && typeof payload?.launchTarget === 'string' && payload.launchTarget) {
    window.__BARDO_CUSTOM_ID__ = `bardo:open:${payload.launchTarget}`;
  }

  try {
    const contextRes = await fetch('/api/discord/channel-context', {headers, cache:'no-store'});
    if (contextRes.ok) {
      window.__bardoChannelContext = await contextRes.json();
    }
  } catch (err) {
    console.warn('Bardo: no se pudo cargar contexto de canal', err);
  }

  if (sdk?.commands?.getInstanceConnectedParticipants) {
    try {
      const participants = await sdk.commands.getInstanceConnectedParticipants();
      if (participants && Array.isArray(participants.participants)) {
        window.__bardoLiveParticipants = participants.participants.map((p) => ({
          id: p.id,
          username: p.username,
          globalName: p.global_name || p.username,
          avatar: p.avatar,
        }));
      }
    } catch {}
  }

  // Planner bootstrap: pick the session to open (live > last opened > latest),
  // keep local unsynced edits, and reconcile the live state by `updatedAt`
  // instead of blindly overwriting the local copy with the server's.
  try {
    const plannerStore = await import('./planner/planner-store.js');
    const {readPendingPlannerEdits, readPendingLiveStates} = await import('./planner/planner-sync.js');
    const readLocalJson = (key) => {
      try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
    };
    const plannerRes = await fetch('/api/planner/sessions', {headers, cache:'no-store'});
    if (plannerRes.ok) {
      const plannerPayload = await plannerRes.json();
      const sessions = Array.isArray(plannerPayload?.sessions) ? plannerPayload.sessions : [];
      window.__bardoChannelSessions = sessions;
      const localPlanner = readLocalJson(PLANNER_STORE_KEY);
      const pendingEdits = readPendingPlannerEdits(localStorage);
      // Launch from a "planner-session:<id>" button: that agenda wins, with the
      // same keep-local-edits rule as any other boot.
      const launchCustomId = String(window.__BARDO_CUSTOM_ID__ || '').replace(/^bardo:open:/, '');
      const preferredId = launchCustomId.startsWith('planner-session:') ? launchCustomId.slice('planner-session:'.length) : null;
      const {session: chosen, keepLocal} = plannerStore.choosePlannerBootSession(sessions, localPlanner, pendingEdits, preferredId);
      if (chosen) {
        const plannerForLive = keepLocal ? localPlanner : plannerStore.normalizeServerSession(chosen);
        if (!keepLocal) localStorage.setItem(PLANNER_STORE_KEY, JSON.stringify(plannerForLive));
        try {
          const liveRes = await fetch(`/api/planner/sessions/${encodeURIComponent(chosen.id)}/live`, {headers, cache:'no-store'});
          if (liveRes.ok) {
            const liveData = await liveRes.json();
            // Local candidates: the live slot (if it belongs to this agenda) and
            // any unsent live state saved for this agenda; newest wins.
            const slot = readLocalJson(LIVE_SESSION_STORE_KEY);
            const slotForChosen = slot && (!slot.plannerSessionId || slot.plannerSessionId === chosen.id) ? slot : null;
            const pendingLive = readPendingLiveStates(localStorage)[chosen.id] || null;
            const timeOf = (value) => Date.parse(value?.updatedAt || '') || 0;
            const localBase = pendingLive && timeOf(pendingLive) > timeOf(slotForChosen) ? pendingLive : slotForChosen;
            const {state, source} = plannerStore.reconcileLiveState(
              plannerForLive,
              localBase,
              liveData?.liveState || null,
            );
            // Overwrite the slot only with a newer server copy or this agenda's
            // own unsent state (other agendas' unsent states stay in the
            // per-agenda pending store).
            if (source === 'remote' || (localBase && localBase !== slotForChosen)) {
              localStorage.setItem(LIVE_SESSION_STORE_KEY, JSON.stringify(plannerStore.serializeLiveSessionState(state)));
            }
          }
        } catch (err) {
          console.warn('Bardo: no se pudo cargar el estado en vivo del planner', err);
        }
      } else if (plannerStore.isDemoPlannerState(localPlanner)) {
        localStorage.removeItem(PLANNER_STORE_KEY);
        localStorage.removeItem(LIVE_SESSION_STORE_KEY);
      }
    }
  } catch (err) {
    console.warn('Bardo: no se pudieron cargar sesiones de D1', err);
  }

  // ── Documentos: motor de sincronización con cola persistente ────────────
  const docsHeaders = () => ({
    Accept: 'application/json',
    ...(window.__BARDO_SESSION_TOKEN__ ? {'Authorization': `Bearer ${window.__BARDO_SESSION_TOKEN__}`} : {}),
    ...(window.__BARDO_CUSTOM_ID__ ? {'x-bardo-custom-id': window.__BARDO_CUSTOM_ID__} : {}),
    ...(instanceId ? {'x-bardo-instance-id': instanceId} : {}),
  });
  const docsRequest = createApiRequest({getHeaders: docsHeaders});
  const remoteListeners = new Set();
  const remoteBacklog = [];
  const deliverRemote = event => {
    if (!remoteListeners.size) {
      remoteBacklog.push(event);
      return;
    }
    remoteListeners.forEach(listener => {
      try { listener(event); } catch (error) { console.error('Bardo Docs: error aplicando cambio remoto', error); }
    });
  };
  const docsSync = createDocsSync({
    request: docsRequest,
    storage: {
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => Storage.prototype.setItem.call(localStorage, key, value),
    },
    emit: detail => window.dispatchEvent(new CustomEvent('bardo-sync-status', {detail})),
    onRemote: deliverRemote,
    // Cola por canal; la cola antigua sin ámbito solo se adopta para documentos
    // de este canal y nunca se crea ni se recrea aquí.
    pendingKey: scopedDocsKey(DOCS_PENDING_KEY, docsScope),
    legacyPendingKey: docsScope ? DOCS_PENDING_KEY : null,
  });
  window.__bardoDocsSync = docsSync;

  const serverDocuments = Array.isArray(payload.documents) ? payload.documents : [];
  let baseDocs;
  if (libraryLoaded) {
    docsSync.registerRemote(serverDocuments);
    baseDocs = serverDocuments.map(item => serverDocToLocal(item));
  } else {
    baseDocs = readCachedDocs();
    docsSync.registerCached(baseDocs);
    deliverRemote({type: 'offline-boot'});
  }
  const legacyQueued = docsSync.loadPending({legacyDocs: legacyCacheDocs});
  if (docsScope && legacyQueued) {
    try { localStorage.removeItem(DOCS_KEYS.store); } catch {}
  }
  // Importaciones que ya fallaron en este dispositivo: se muestran como error
  // (con "Eliminar" / "Descargar original") en vez de "Procesando archivo…".
  const importFailures = readImportFailures();
  const stillPendingIds = new Set(serverDocuments.filter(item => item?.importStatus === 'pending').map(item => item.id));
  let failuresChanged = false;
  Object.keys(importFailures).forEach(id => {
    if (libraryLoaded && !stillPendingIds.has(id)) {
      delete importFailures[id];
      failuresChanged = true;
    }
  });
  if (failuresChanged) writeImportFailures(importFailures);
  const markFailed = doc => (doc.importStatus === 'pending' && importFailures[doc.id]
    ? {...doc, importStatus: 'failed', importError: importFailures[doc.id].message || ''}
    : doc);
  // Las ediciones locales sin confirmar se superponen ANTES de que la copia del
  // servidor reemplace el store, y se reenvían de inmediato.
  const docs = docsSync.overlayPending(baseDocs).map(markFailed);
  const initialStore = {version:1, docs, deletedIds:[]};
  window.__BARDO_INITIAL_STORE__ = initialStore;
  try {
    localStorage.setItem(scopedDocsKey(STORE_KEY, docsScope), JSON.stringify(initialStore));
  } catch (error) {
    console.warn('Bardo Docs: almacenamiento local lleno; la biblioteca queda en memoria', error);
  }
  docsSync.flush();

  window.__bardoSyncDocs = store => docsSync.track(store);
  window.__bardoDocSyncState = id => docsSync.stateFor(id);
  window.__bardoSettleDocument = id => docsSync.settle(id);
  // Marcar una tarea en el lector: ante un 409 se reaplica sobre la versión del
  // servidor en vez de crear una "copia en conflicto".
  window.__bardoNoteChecklistToggle = (id, op, prevDoc) => docsSync.noteChecklistToggle(id, op, prevDoc);
  // Cambios sin enviar que pertenecen a otro canal: visibles, con Reintentar / Descartar.
  window.__bardoParkedChanges = () => docsSync.parkedSummary();
  window.__bardoRetryParked = () => docsSync.retryParked();
  window.__bardoDiscardParked = () => docsSync.discardParked();
  window.__bardoSubscribeDocs = listener => {
    remoteListeners.add(listener);
    remoteBacklog.splice(0).forEach(event => listener(event));
    return () => remoteListeners.delete(listener);
  };

  // Al cerrar/ocultar: el editor (listeners en captura) ya encoló su último
  // snapshot; aquí se envía todo lo pendiente con keepalive, sin esperar la cola.
  window.addEventListener('pagehide', () => { docsSync.flushKeepalive(); });
  window.addEventListener('online', () => {
    docsSync.retryNow();
    if (!libraryLoaded) refreshLibrary();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') docsSync.flushKeepalive();
    else docsSync.retryNow();
  });

  // Biblioteca no cargada al arrancar: reintentar en segundo plano y fusionar.
  let refreshTimer = null;
  let refreshing = false;
  async function refreshLibrary() {
    if (libraryLoaded || refreshing) return;
    refreshing = true;
    clearTimeout(refreshTimer);
    try {
      const result = await fetchDocsLibrary({headers: docsHeaders(), attempts: 2});
      if (result.ok) {
        libraryLoaded = true;
        const items = Array.isArray(result.payload?.documents) ? result.payload.documents : [];
        docsSync.registerRemote(items);
        deliverRemote({
          type: 'refresh',
          docs: items.filter(item => !docsSync.pending.has(item.id)).map(item => serverDocToLocal(item)),
        });
        docsSync.retryNow();
        return;
      }
    } finally {
      refreshing = false;
    }
    refreshTimer = setTimeout(refreshLibrary, 15_000);
  }
  if (!libraryLoaded) refreshTimer = setTimeout(refreshLibrary, 5_000);

  // Importaciones PDF/DOCX pendientes: normalizar en segundo plano y refrescar
  // el store. Si un archivo no se puede leer (dañado, con contraseña, escaneado
  // o demasiado largo) el documento muestra el error en vez de quedar
  // "Procesando archivo…" para siempre.
  const pendingImports = serverDocuments.filter(item => item?.importStatus === 'pending' && item?.hasSource && !importFailures[item.id]);
  if (pendingImports.length) {
    setTimeout(() => {
      normalizePendingImports(pendingImports, {
        request: docsRequest,
        onFailure: (doc, error) => {
          const failure = {code: error?.code || 'unreadable', message: error?.userMessage || '', at: Date.now()};
          const failures = readImportFailures();
          failures[doc.id] = failure;
          writeImportFailures(failures);
          deliverRemote({type: 'import-failed', id: doc.id, message: failure.message});
        },
      }).then(normalized => {
        if (!normalized.length) return;
        docsSync.registerRemote(normalized);
        deliverRemote({
          type: 'replace',
          docs: normalized
            .filter(item => !docsSync.pending.has(item.id))
            .map(item => serverDocToLocal(item)),
        });
      }).catch(error => console.error('Bardo Docs: no se pudieron normalizar importaciones', error));
    }, 0);
  }

  const explicitCustomId = window.__BARDO_CUSTOM_ID__?.startsWith('bardo:open:')
    ? window.__BARDO_CUSTOM_ID__.slice('bardo:open:'.length)
    : window.__BARDO_CUSTOM_ID__;
  // Prefer the explicit component custom id. On Discord mobile the SDK can
  // omit it, in which case the API returns the short-lived launch intent.
  const launch = parseDocsLaunchTarget(explicitCustomId);
  const contextId = payload.contextDocumentId || (launch.type === 'doc' ? launch.id : null);
  window.__BARDO_LAUNCH_MISSING_DOC__ = null;
  window.__BARDO_PENDING_NEW_TITLE__ = null;
  const rememberOpened = id => {
    try {
      localStorage.setItem(scopedDocsKey(DOCS_KEYS.lastOpened, docsScope), JSON.stringify({id, offset:0, at:Date.now()}));
    } catch {}
  };

  if (launch.type === 'edit') {
    // Tarjeta de /doc-new: el documento ya existe en el servidor; abrir su editor.
    if (docs.some(doc => doc.id === launch.id)) {
      rememberOpened(launch.id);
      window.__BARDO_DOCUMENT_ID__ = launch.id;
      history.replaceState(null, '', `#edit-${encodeURIComponent(launch.id)}`);
    } else {
      window.__BARDO_DOCUMENT_ID__ = null;
      window.__BARDO_LAUNCH_MISSING_DOC__ = launch.id;
      history.replaceState(null, '', '#docs');
    }
  } else if (explicitCustomId === 'new-doc' || explicitCustomId?.startsWith('new-doc:')) {
    const requestedTitle = explicitCustomId.slice('new-doc:'.length).trim();
    // Con un borrador sin terminar, la app pregunta "Continuar" / "Empezar uno nuevo".
    if (requestedTitle && !prefillNewDocTitle(requestedTitle)) window.__BARDO_PENDING_NEW_TITLE__ = requestedTitle;
    history.replaceState(null, '', '#new');
  } else if (explicitCustomId === 'planner') {
    history.replaceState(null, '', '#planner');
  } else if (explicitCustomId?.startsWith('planner-session:')) {
    // The planner bootstrap above already opened this agenda (preferredId),
    // keeping unsynced local edits; writing the raw server row here would
    // revert them. Land on its agenda, not on the meetings list.
    let openedPlannerId = null;
    try {
      openedPlannerId = JSON.parse(localStorage.getItem(PLANNER_STORE_KEY) || 'null')?.id || null;
    } catch {}
    history.replaceState(null, '', plannerSessionLaunchHash(explicitCustomId.slice('planner-session:'.length), openedPlannerId));
  } else if (contextId && docs.some(doc => doc.id === contextId)) {
    rememberOpened(contextId);
    window.__BARDO_DOCUMENT_ID__ = contextId;
    history.replaceState(null, '', `#doc-${encodeURIComponent(contextId)}`);
  } else {
    window.__BARDO_DOCUMENT_ID__ = null;
    // Tarjeta de un documento archivado o eliminado: la app explica qué pasó.
    if (contextId) window.__BARDO_LAUNCH_MISSING_DOC__ = contextId;
    if (!location.hash || location.hash === '#docs') {
      history.replaceState(null, '', '#docs');
    }
  }

  if (!location.hash) {
    history.replaceState(null, '', '#docs');
  }

  const nativeSetItem = Storage.prototype.setItem;
  let syncChain = Promise.resolve();

  const request = (path, init = {}) => docsRequest(path, init);

  const UNSAVED_MESSAGE = 'El documento tiene cambios sin guardar. Revisa tu conexión e intenta de nuevo.';

  window.__bardoPublishDocument = async documentId => {
    // Publicar la versión guardada más reciente.
    const settled = await docsSync.settle(documentId);
    if (!settled) throw new Error(UNSAVED_MESSAGE);
    try {
      return await request(`/api/docs/${encodeURIComponent(documentId)}/message`, {method:'POST'});
    } catch (error) {
      const message = error?.status === 403 && error?.data?.error === 'publish_failed'
        ? 'Bardo no tiene permiso para escribir en este canal. Pide a quien administra el servidor que le permita enviar mensajes aquí.'
        : userFacingError(error, 'No se pudo compartir el documento en el canal.');
      throw new Error(message);
    }
  };

  /**
   * Enlace firmado y de corta duración para descargar un documento (md, docx,
   * pdf) fuera de Discord: el iframe de la Activity no descarga archivos de
   * forma fiable, así que el enlace se abre en el navegador del usuario.
   */
  window.__bardoExportLink = async (documentId, format) => {
    const settled = await docsSync.settle(documentId);
    if (!settled) throw new Error(UNSAVED_MESSAGE);
    let data;
    try {
      data = await request(`/api/docs/${encodeURIComponent(documentId)}/export-link`, {method:'POST', body:{format}});
    } catch (error) {
      throw new Error(userFacingError(error, 'No pudimos preparar la descarga. Intenta de nuevo.'));
    }
    if (!data?.url) throw new Error('No pudimos preparar la descarga. Intenta de nuevo.');
    return data;
  };

  /**
   * Archivo original de una importación (PDF/DOCX). Primero intenta un enlace
   * firmado (formato "original"); si el servidor no lo ofrece, lo descarga con
   * la sesión actual.
   */
  window.__bardoDownloadOriginal = async documentId => {
    try {
      const data = await request(`/api/docs/${encodeURIComponent(documentId)}/export-link`, {method:'POST', body:{format:'original'}});
      if (data?.url) return {url: data.url};
    } catch (error) {
      if (error?.status === 401 || error?.status === 403 || !error?.status) {
        throw new Error(userFacingError(error, 'No pudimos descargar el archivo original.'));
      }
    }
    let response;
    try {
      response = await fetch(`/api/docs/${encodeURIComponent(documentId)}/source`, {
        headers: {...docsHeaders(), Accept: 'application/octet-stream'},
        cache: 'no-store',
      });
    } catch (error) {
      throw new Error(userFacingError(new HttpError(0, {detail: error?.message}), ''));
    }
    if (!response.ok) {
      throw new Error(response.status === 404
        ? 'El archivo original ya no está disponible.'
        : 'No pudimos descargar el archivo original.');
    }
    const blob = await response.blob();
    triggerBlobDownload(blob, responseFileName(response, 'archivo-original'));
    return {downloaded: true};
  };

  /**
   * Documento individual (incluye archivados) en formato del store, ya
   * registrado como confirmado por el servidor; null si no existe o no está
   * compartido en este canal.
   */
  window.__bardoFetchDocument = async documentId => {
    let data;
    try {
      data = await request(`/api/docs/${encodeURIComponent(documentId)}`);
    } catch (error) {
      if (error?.status === 404 || error?.status === 403) return null;
      throw error;
    }
    const item = data?.id ? data : (data?.document || null);
    if (!item?.id) return null;
    docsSync.registerRemote([item]);
    return serverDocToLocal(item);
  };

  /** Ids de los documentos archivados (sin contenido) para el contador de la pestaña. */
  window.__bardoFetchArchivedSummary = async () => {
    const res = await request('/api/docs?archived=1&summary=1');
    return (Array.isArray(res?.documents) ? res.documents : []).map(item => item?.id).filter(Boolean);
  };

  window.__bardoDeleteDocumentPermanent = async documentId => {
    try {
      await request(`/api/docs/${encodeURIComponent(documentId)}/permanent`, {method:'DELETE'});
    } catch (error) {
      if (error?.status === 404) {
        docsSync.forget(documentId);
        return null;
      }
      const code = error?.data?.error;
      const message = error?.status === 403
        ? 'Solo quien creó el documento o alguien con permisos de moderación puede eliminarlo definitivamente.'
        : error?.status === 409 && code === 'not_archived'
          ? 'Archiva el documento antes de eliminarlo definitivamente.'
          : userFacingError(error, 'No se pudo eliminar el documento.');
      const wrapped = new Error(message);
      wrapped.status = error?.status;
      throw wrapped;
    }
    docsSync.forget(documentId);
    return null;
  };

  window.__bardoFetchArchivedDocs = async () => {
    const res = await request('/api/docs?archived=1');
    const items = Array.isArray(res?.documents) ? res.documents : [];
    // Registrar como confirmados por el servidor: así no se reenvían como nuevos (POST).
    docsSync.registerRemote(items, {archived: true});
    return items.map(item => serverDocToLocal(item, {archived: true}));
  };

  // Planner persistence is owned by activity-app/src/planner/planner-sync.js,
  // which PlannerModule drives explicitly: debounced PATCH with baseUpdatedAt,
  // 409/404 handling, retries, and live pushes scoped by an explicit session
  // id. Mirroring every localStorage write here caused per-keystroke PATCHes,
  // phantom sessions and live state posted under the wrong session id, so the
  // localStorage hooks for planner keys are intentionally no-ops.
  async function syncPlannerStore(_nextJson) {}

  async function syncLiveSessionStore(_nextJson) {}

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    nativeSetItem.call(this, key, value);
    if (this === localStorage && window.__BARDO_PRODUCTION__) {
      // Los documentos se sincronizan explícitamente vía window.__bardoSyncDocs.
      if (key === PLANNER_STORE_KEY) {
        syncChain = syncChain.then(() => syncPlannerStore(String(value))).catch(error => console.error('Bardo Planner: error sincronizando D1', error));
      } else if (key === LIVE_SESSION_STORE_KEY) {
        syncChain = syncChain.then(() => syncLiveSessionStore(String(value))).catch(error => console.error('Bardo Live: error sincronizando D1', error));
      }
    }
  };

  return true;
}
