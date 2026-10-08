import {markdownToHtml} from './editor/bardo-markdown.js';
import {
  DOCS_STORE_KEY as STORE_KEY,
  createApiRequest,
  createDocsSync,
  errorMessage,
  fetchDocsLibrary,
  serverDocToLocal,
} from './production-docs-sync.js';
import {normalizePendingImports} from './production-import-normalizer.js';

export {markdownToHtml};

const LAST_OPENED_KEY = 'bardo.docs.heroui.last-opened.v1';
const PLANNER_STORE_KEY = 'bardo-planner-session-state-v1';
const LIVE_SESSION_STORE_KEY = 'bardo-planner-live-session-v1';
const FALLBACK_CLIENT_ID = '1539704001535156254';

function responseFileName(response, fallback) {
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch {}
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallback;
}

function triggerBlobDownload(blob, filename, {preview = false} = {}) {
  const objectUrl = URL.createObjectURL(blob);
  if (preview) return {url: objectUrl, filename, mime: blob.type || 'application/octet-stream'};

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

function readCachedDocs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return Array.isArray(parsed?.docs) ? parsed.docs.filter(doc => doc?.id) : [];
  } catch {
    return [];
  }
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

const NEW_DOC_DRAFT_KEY = 'bardo.docs.heroui.draft.v1';

/**
 * "/doc-new titulo:..." carries the title in the button's custom_id. Prefill
 * it into the new-document draft, but never overwrite a draft that already
 * has a title or content (that would lose unfinished work).
 */
export function prefillNewDocTitle(rawTitle, storage = globalThis.localStorage) {
  const title = String(rawTitle || '').trim();
  if (!title || !storage) return false;
  try {
    const draft = JSON.parse(storage.getItem(NEW_DOC_DRAFT_KEY) || 'null');
    const body = String(draft?.body || '').replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/gi, '').trim();
    if (draft?.title?.trim() || draft?.description?.trim() || body) return false;
    storage.setItem(NEW_DOC_DRAFT_KEY, JSON.stringify({
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

  window.__bardoExportDocument = async (documentId, format, options = {}) => {
    // Exportar la última versión: primero se envían los cambios pendientes.
    if (window.__bardoSettleDocument) await window.__bardoSettleDocument(documentId);
    const url = `${window.location.origin}/api/documents/${encodeURIComponent(documentId)}/export?format=${encodeURIComponent(format)}`;
    const headers = {'Accept': 'application/octet-stream'};
    if (window.__BARDO_SESSION_TOKEN__) headers['Authorization'] = `Bearer ${window.__BARDO_SESSION_TOKEN__}`;
    if (window.__BARDO_CUSTOM_ID__) headers['x-bardo-custom-id'] = window.__BARDO_CUSTOM_ID__;
    if (instanceId) headers['x-bardo-instance-id'] = instanceId;

    const response = await fetch(url, {headers, cache: 'no-store'});
    if (!response.ok) throw new Error(`Export HTTP ${response.status}`);

    const blob = await response.blob();
    const fallbackName = `${documentId}.${format === 'word' ? 'docx' : format}`;
    return triggerBlobDownload(blob, responseFileName(response, fallbackName), options);
  };

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
  docsSync.loadPending();
  // Las ediciones locales sin confirmar se superponen ANTES de que la copia del
  // servidor reemplace el store, y se reenvían de inmediato.
  const docs = docsSync.overlayPending(baseDocs);
  const initialStore = {version:1, docs, deletedIds:[]};
  window.__BARDO_INITIAL_STORE__ = initialStore;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(initialStore));
  } catch (error) {
    console.warn('Bardo Docs: almacenamiento local lleno; la biblioteca queda en memoria', error);
  }
  docsSync.flush();

  window.__bardoSyncDocs = store => docsSync.track(store);
  window.__bardoDocSyncState = id => docsSync.stateFor(id);
  window.__bardoSettleDocument = id => docsSync.settle(id);
  window.__bardoResolveDocConflict = id => docsSync.resolveConflict(id);
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

  // Importaciones PDF/DOCX pendientes: normalizar en segundo plano y refrescar el store.
  const pendingImports = serverDocuments.filter(item => item?.importStatus === 'pending' && item?.hasSource);
  if (pendingImports.length) {
    setTimeout(() => {
      normalizePendingImports(pendingImports, {request: docsRequest}).then(normalized => {
        if (!normalized.length) return;
        docsSync.registerRemote(normalized);
        deliverRemote({
          type: 'replace',
          docs: normalized
            .filter(item => !docsSync.pending.has(item.id))
            .map(item => serverDocToLocal(item)),
        });
        window.dispatchEvent(new CustomEvent('bardo-documents-normalized', {detail: {documents: normalized}}));
      }).catch(error => console.error('Bardo Docs: no se pudieron normalizar importaciones', error));
    }, 0);
  }

  const explicitCustomId = window.__BARDO_CUSTOM_ID__?.startsWith('bardo:open:')
    ? window.__BARDO_CUSTOM_ID__.slice('bardo:open:'.length)
    : window.__BARDO_CUSTOM_ID__;
  // Prefer the explicit component custom id. On Discord mobile the SDK can
  // omit it, in which case the API returns the short-lived launch intent.
  const contextId = payload.contextDocumentId || explicitCustomId;

  if (explicitCustomId === 'new-doc' || explicitCustomId?.startsWith('new-doc:')) {
    prefillNewDocTitle(explicitCustomId.slice('new-doc:'.length));
    history.replaceState(null, '', '#new');
  } else if (explicitCustomId === 'planner') {
    history.replaceState(null, '', '#planner');
  } else if (explicitCustomId?.startsWith('planner-session:')) {
    // The planner bootstrap above already opened this agenda (preferredId),
    // keeping unsynced local edits; writing the raw server row here would
    // revert them.
    history.replaceState(null, '', '#planner');
  } else if (contextId && docs.some(doc => doc.id === contextId)) {
    try {
      localStorage.setItem(LAST_OPENED_KEY, JSON.stringify({id:contextId, offset:0, at:Date.now()}));
    } catch {}
    window.__BARDO_DOCUMENT_ID__ = contextId;
    history.replaceState(null, '', `#doc-${encodeURIComponent(contextId)}`);
  } else {
    window.__BARDO_DOCUMENT_ID__ = null;
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

  window.__bardoPublishDocument = async documentId => {
    // Publicar la versión guardada más reciente.
    const settled = await docsSync.settle(documentId);
    if (!settled) throw new Error('El documento tiene cambios sin guardar. Revisa tu conexión e intenta de nuevo.');
    return request(`/api/docs/${encodeURIComponent(documentId)}/message`, {method:'POST'});
  };

  window.__bardoRestoreDocument = async documentId => {
    return request(`/api/docs/${encodeURIComponent(documentId)}/restore`, {method:'POST'});
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
          : errorMessage(error);
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
