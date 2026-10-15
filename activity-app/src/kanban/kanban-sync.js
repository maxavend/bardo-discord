// Motor de Tareas: cola serial de operaciones optimistas + poll por rev.
// JS puro (sin React ni alias) para poder probarlo desde Node.
//
// - Lo que se ve = servidor + operaciones pendientes (kanban-store.applyOps).
// - Ediciones: se agrupan por tarjeta y salen 800 ms después del último cambio.
// - Movimientos, altas y archivados salen de inmediato, en orden.
// - Red/429/5xx: reintento con backoff; la operación queda guardada.
// - 409: fusión por campo; 404/410/422: se descarta y se avisa por qué.
// - Sin Discord (modo local) todo vive en localStorage, con el mismo código.
import {scopedDocsKey} from '../docs-storage.js';
import {
  PlannerApiError,
  backoffDelay,
  isRetryableStatus,
  plannerRequest,
} from '../planner/planner-sync.js';
import {
  applyBoardResponse,
  applyOps,
  applyServerCard,
  applyStructure,
  emptyServerState,
} from './kanban-store.js';
import {cardFieldValue, describeLostFields, mergeCardConflict} from './kanban-merge.js';
import {DEFAULT_KANBAN_COLUMNS} from './kanban-shared.js';

export const KANBAN_BOARD_KEY = 'bardo.kanban.board.v1';
export const KANBAN_PENDING_KEY = 'bardo.kanban.pending.v1';
export const KANBAN_PATCH_DEBOUNCE_MS = 800;
export const KANBAN_POLL_MS = 4000;

const STRUCTURE_OPS = new Set(['addColumn', 'renameColumn', 'setDoneColumn', 'reorderColumns', 'deleteColumn', 'addTag', 'updateTag', 'deleteTag']);

export function newKanbanId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function readJson(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Almacenamiento lleno o bloqueado: la sesión sigue en memoria.
  }
}

/** Tablero inicial del modo local (sin Discord). */
export function localStarterState() {
  const columns = DEFAULT_KANBAN_COLUMNS.map((column, position) => ({
    id: `local-col-${position}`, name: column.name, position, isDone: column.isDone,
  }));
  return {...emptyServerState(), board: {id: 'local-board', guildId: null, channelId: null, columns, tags: []}, cursor: 0};
}

function patchPayload(op) {
  const payload = {baseVersion: op.baseVersion};
  for (const [field, value] of Object.entries(op.fields)) {
    if (field === 'assignee') {
      payload.assigneeId = value?.id || null;
      payload.assigneeName = value?.name || null;
    } else {
      payload[field] = value;
    }
  }
  return payload;
}

function createPayload(op) {
  const {card} = op;
  return {
    id: card.id,
    columnId: card.columnId,
    afterId: op.afterId ?? null,
    beforeId: op.beforeId ?? null,
    title: card.title,
    description: card.description || '',
    priority: card.priority || 'normal',
    dueDate: card.dueDate || null,
    tagIds: card.tagIds || [],
    subtasks: card.subtasks || [],
    docIds: card.docIds || [],
    assigneeId: card.assignee?.id || null,
    assigneeName: card.assignee?.name || null,
  };
}

const enc = encodeURIComponent;

function requestFor(op) {
  switch (op.type) {
    case 'create': return ['/api/kanban/cards', {method: 'POST', body: createPayload(op)}];
    case 'patch': return [`/api/kanban/cards/${enc(op.id)}`, {method: 'PATCH', body: patchPayload(op)}];
    case 'move': return [`/api/kanban/cards/${enc(op.id)}/move`, {method: 'POST', body: {columnId: op.columnId, afterId: op.afterId, beforeId: op.beforeId}}];
    case 'archive': return [`/api/kanban/cards/${enc(op.id)}/archive`, {method: 'POST'}];
    case 'restore': return [`/api/kanban/cards/${enc(op.card.id)}/restore`, {method: 'POST'}];
    case 'addColumn': return ['/api/kanban/columns', {method: 'POST', body: {id: op.columnId, name: op.name}}];
    case 'renameColumn': return [`/api/kanban/columns/${enc(op.id)}`, {method: 'PATCH', body: {name: op.name}}];
    case 'setDoneColumn': return [`/api/kanban/columns/${enc(op.id)}`, {method: 'PATCH', body: {isDone: true}}];
    case 'reorderColumns': return ['/api/kanban/columns/reorder', {method: 'POST', body: {order: op.order}}];
    case 'deleteColumn': return [`/api/kanban/columns/${enc(op.id)}${op.moveTo ? `?moveTo=${enc(op.moveTo)}` : ''}`, {method: 'DELETE'}];
    case 'addTag': return ['/api/kanban/tags', {method: 'POST', body: {id: op.tagId, name: op.name, color: op.color}}];
    case 'updateTag': return [`/api/kanban/tags/${enc(op.id)}`, {method: 'PATCH', body: op.fields}];
    case 'deleteTag': return [`/api/kanban/tags/${enc(op.id)}`, {method: 'DELETE'}];
    default: return null;
  }
}

/**
 * @param {object} options
 * @param {boolean} options.remote  true con sesión de Discord; false = modo local.
 * @param {Storage} [options.storage]
 * @param {Function} [options.fetchImpl]
 * @param {(notice: {message: string, cardId?: string}) => void} [options.onNotice]
 * @param {() => number} [options.now]
 * @param {(fn: Function, ms: number) => any} [options.setTimer]
 * @param {(handle: any) => void} [options.clearTimer]
 */
export function createKanbanEngine({
  remote,
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  fetchImpl,
  onNotice = () => {},
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = handle => clearTimeout(handle),
  seed = null,
} = {}) {
  const boardKey = () => scopedDocsKey(KANBAN_BOARD_KEY);
  const pendingKey = () => scopedDocsKey(KANBAN_PENDING_KEY);
  const request = (path, init = {}) => plannerRequest(path, {
    ...init,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }, fetchImpl);

  const cached = readJson(storage, boardKey());
  let server = cached?.board ? {...emptyServerState(), ...cached} : (remote ? emptyServerState() : (seed || localStarterState()));
  let ops = remote ? (readJson(storage, pendingKey()) || []).filter(op => op && op.type) : [];
  let capabilities = null;
  let status = 'idle';
  let loaded = Boolean(server.board);
  let loadError = null;
  let snapshot = null;
  let flushTimer = null;
  let flushing = false;
  let attempt = 0;
  let polling = false;
  let paused = 0;
  const listeners = new Set();

  function persist() {
    writeJson(storage, boardKey(), {board: server.board, cards: server.cards, cursor: server.cursor, structureRev: server.structureRev});
    if (remote) writeJson(storage, pendingKey(), ops.length ? ops : null);
  }

  function emit() {
    snapshot = null;
    for (const listener of listeners) listener();
  }

  function setStatus(next) {
    if (status === next) return;
    status = next;
    emit();
  }

  function getSnapshot() {
    if (!snapshot) {
      snapshot = {
        view: applyOps(server, ops),
        server,
        pendingCount: ops.length,
        capabilities,
        status,
        loaded,
        loadError,
        remote,
      };
    }
    return snapshot;
  }

  function scheduleFlush(delay = 0) {
    if (!remote) return;
    if (flushTimer) clearTimer(flushTimer);
    flushTimer = setTimer(() => {
      flushTimer = null;
      void flush();
    }, Math.max(0, delay));
  }

  // -------------------------------------------------------------------------
  // Envío

  function dropOp(op) {
    ops = ops.filter(item => item.opId !== op.opId);
  }

  function handleConflict(op, serverCard) {
    server = applyServerCard(server, serverCard);
    const {retry, lost} = mergeCardConflict(op, serverCard);
    dropOp(op);
    if (Object.keys(retry).length) {
      ops.unshift({
        ...op,
        opId: newKanbanId(),
        fields: retry,
        base: Object.fromEntries(Object.keys(retry).map(field => [field, cardFieldValue(serverCard, field)])),
        baseVersion: serverCard.version,
        readyAt: 0,
      });
    }
    if (lost.length) {
      onNotice({message: `Otra persona cambió ${describeLostFields(lost)} de #${serverCard.number}. Se mantuvo su versión.`, cardId: serverCard.id});
    }
  }

  function applyResponse(op, data) {
    if (data?.card) server = applyServerCard(server, data.card);
    if (data?.board) server = applyStructure(server, data.board);
  }

  async function sendOp(op) {
    const target = requestFor(op);
    if (!target) {
      dropOp(op);
      return;
    }
    try {
      const data = await request(...target);
      applyResponse(op, data);
      dropOp(op);
      attempt = 0;
      setStatus(ops.length ? 'saving' : 'saved');
    } catch (error) {
      if (!(error instanceof PlannerApiError)) throw error;
      if (isRetryableStatus(error.status)) {
        attempt += 1;
        setStatus('offline');
        persist();
        emit();
        scheduleFlush(backoffDelay(attempt - 1, error.retryAfterMs));
        throw error;
      }
      attempt = 0;
      const data = error.data || {};
      if (error.status === 409 && op.type === 'patch' && data.card) {
        handleConflict(op, data.card);
      } else {
        applyResponse(op, data);
        dropOp(op);
        if (error.status === 410 && data.card) {
          server = applyServerCard(server, {...data.card, archivedAt: data.card.archivedAt || 'archived'});
          onNotice({message: `La tarea #${data.card.number} fue archivada por otra persona.`, cardId: data.card.id});
        } else if (error.status === 404 && (op.type === 'patch' || op.type === 'move' || op.type === 'archive')) {
          const cards = {...server.cards};
          delete cards[op.id];
          server = {...server, cards};
          onNotice({message: data.message || 'Esa tarea ya no existe en este canal.'});
        } else if (error.status === 401) {
          onNotice({message: data.message || 'Tu sesión de Bardo expiró. Cierra y vuelve a abrir la actividad.'});
        } else {
          onNotice({message: data.message || 'No se pudo guardar el cambio.', cardId: op.id});
        }
      }
      setStatus(error.status === 401 ? 'error' : 'idle');
    }
  }

  async function flush() {
    if (!remote || flushing) return;
    flushing = true;
    try {
      while (ops.length) {
        const op = ops[0];
        const wait = (op.readyAt || 0) - now();
        if (wait > 0) {
          scheduleFlush(wait);
          return;
        }
        setStatus('saving');
        try {
          await sendOp(op);
        } catch {
          return; // reintento ya programado
        }
        persist();
        emit();
      }
    } finally {
      flushing = false;
    }
  }

  function dispatch(op) {
    const entry = {opId: newKanbanId(), readyAt: 0, ...op};
    if (!remote) {
      server = applyOps(server, [entry]);
      // En local no hay servidor: las tarjetas dejan de estar "pendientes".
      server = {...server, cards: Object.fromEntries(Object.entries(server.cards).map(([id, card]) => [id, card.pending ? {...card, pending: false, rev: 0} : card]))};
      if (server.board) {
        server = {...server, board: {
          ...server.board,
          columns: server.board.columns.map(({pending: _pending, ...column}) => column),
          tags: server.board.tags.map(({pending: _pending, ...tag}) => tag),
        }};
      }
      persist();
      emit();
      return entry;
    }
    ops = [...ops, entry];
    persist();
    emit();
    scheduleFlush(entry.readyAt ? entry.readyAt - now() : 0);
    return entry;
  }

  // -------------------------------------------------------------------------
  // Lectura

  async function load() {
    if (!remote) {
      loaded = true;
      emit();
      return;
    }
    try {
      const data = await request('/api/kanban/board?capabilities=1');
      server = applyBoardResponse(server, {...data, full: true});
      capabilities = data.capabilities || null;
      loaded = true;
      loadError = null;
      persist();
      emit();
      scheduleFlush(0);
    } catch (error) {
      loadError = error;
      loaded = Boolean(server.board);
      emit();
      if (!(error instanceof PlannerApiError) || isRetryableStatus(error.status)) scheduleFlush(0);
    }
  }

  async function poll() {
    if (!remote || polling || paused > 0 || !loaded) return;
    polling = true;
    try {
      const since = server.cursor ?? '';
      const data = await request(`/api/kanban/board?since=${since}`);
      if (paused > 0) return; // se soltó una tarjeta mientras llegaba la respuesta
      if (!data?.unchanged) {
        server = applyBoardResponse(server, data);
        persist();
        emit();
      }
      if (status === 'offline') setStatus('idle');
      if (ops.length) scheduleFlush(0);
    } catch (error) {
      if (error instanceof PlannerApiError && isRetryableStatus(error.status)) setStatus('offline');
    } finally {
      polling = false;
    }
  }

  // -------------------------------------------------------------------------
  // Acciones

  function currentCard(id) {
    return getSnapshot().view.cards[id] || null;
  }

  function createCard(fields, {afterId = null, beforeId = null} = {}) {
    const card = {id: newKanbanId(), ...fields};
    dispatch({type: 'create', card, afterId, beforeId});
    return card.id;
  }

  /** Agrupa ediciones de la misma tarjeta mientras no hayan salido. */
  function patchCard(id, fields) {
    const card = currentCard(id);
    if (!card) return;
    const serverCard = server.cards[id];
    const pendingCreate = ops.find(op => op.type === 'create' && op.card.id === id);
    if (pendingCreate && (!flushing || ops[0] !== pendingCreate)) {
      // La tarjeta aún no existe en el servidor: se edita el alta pendiente.
      pendingCreate.card = {...pendingCreate.card, ...fields};
      persist();
      emit();
      return;
    }
    const last = ops.at(-1);
    const delay = KANBAN_PATCH_DEBOUNCE_MS;
    if (remote && last?.type === 'patch' && last.id === id && !(flushing && ops[0] === last)) {
      const base = {...last.base};
      for (const field of Object.keys(fields)) if (!(field in base)) base[field] = cardFieldValue(card, field);
      ops = [...ops.slice(0, -1), {...last, fields: {...last.fields, ...fields}, base, readyAt: now() + delay}];
      persist();
      emit();
      scheduleFlush(delay);
      return;
    }
    dispatch({
      type: 'patch',
      id,
      fields,
      base: Object.fromEntries(Object.keys(fields).map(field => [field, cardFieldValue(card, field)])),
      baseVersion: serverCard?.version ?? card.version ?? null,
      readyAt: remote ? now() + delay : 0,
    });
  }

  function moveCard(id, columnId, {afterId = null, beforeId = null} = {}) {
    // Un alta pendiente se mueve en sí misma, sin otra petición.
    const pendingCreate = ops.find(op => op.type === 'create' && op.card.id === id);
    if (pendingCreate && (!flushing || ops[0] !== pendingCreate)) {
      pendingCreate.card = {...pendingCreate.card, columnId, rank: undefined};
      pendingCreate.afterId = afterId;
      pendingCreate.beforeId = beforeId;
      persist();
      emit();
      return;
    }
    dispatch({type: 'move', id, columnId, afterId, beforeId});
  }

  function archiveCard(id) {
    const card = currentCard(id);
    dispatch({type: 'archive', id});
    return card;
  }

  function restoreCard(card) {
    dispatch({type: 'restore', card});
  }

  const structure = op => dispatch(op);

  /** Ejecuta pendientes ya (al cerrar el detalle o salir de la vista). */
  function flushNow() {
    ops = ops.map(op => (op.readyAt ? {...op, readyAt: 0} : op));
    scheduleFlush(0);
  }

  async function call(path, init) {
    if (!remote) throw new PlannerApiError('Disponible al abrir Bardo en Discord.', {status: 0, code: 'local_mode'});
    const data = await request(path, init);
    if (data?.card) {
      server = applyServerCard(server, data.card);
      persist();
      emit();
    }
    return data;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    load,
    poll,
    flush,
    flushNow,
    pausePolling() { paused += 1; },
    resumePolling() { paused = Math.max(0, paused - 1); },
    createCard,
    patchCard,
    moveCard,
    archiveCard,
    restoreCard,
    addColumn: name => {
      const columnId = newKanbanId();
      structure({type: 'addColumn', columnId, name});
      return columnId;
    },
    renameColumn: (id, name) => structure({type: 'renameColumn', id, name}),
    setDoneColumn: id => structure({type: 'setDoneColumn', id}),
    reorderColumns: order => structure({type: 'reorderColumns', order}),
    deleteColumn: (id, moveTo = null) => structure({type: 'deleteColumn', id, moveTo}),
    addTag: (name, color) => {
      const tagId = newKanbanId();
      structure({type: 'addTag', tagId, name, color});
      return tagId;
    },
    updateTag: (id, fields) => structure({type: 'updateTag', id, fields}),
    deleteTag: id => structure({type: 'deleteTag', id}),
    openThread: id => call(`/api/kanban/cards/${enc(id)}/thread`, {method: 'POST'}),
    retryNotice: id => call(`/api/kanban/cards/${enc(id)}/notify`, {method: 'POST'}),
    fetchCard: id => call(`/api/kanban/cards/${enc(id)}`),
    async listArchived() {
      if (!remote) return [];
      return (await request('/api/kanban/cards?archived=1'))?.cards || [];
    },
    async cardsFromSource(sessionId) {
      if (!remote) {
        return Object.values(getSnapshot().view.cards).filter(card => card.sourceRef?.startsWith(`planner:${sessionId}:`));
      }
      return (await request(`/api/kanban/cards?source=${enc(`planner:${sessionId}`)}`))?.cards || [];
    },
    /** Acuerdos de una reunión → tareas. Devuelve {created, existing}. */
    async createFromAgreements({sessionId, sessionTitle, columnId, cards}) {
      if (!remote) {
        const existingRefs = new Set(Object.values(getSnapshot().view.cards).map(card => card.sourceRef).filter(Boolean));
        const created = [];
        const existing = [];
        for (const item of cards) {
          if (existingRefs.has(item.sourceRef)) {
            existing.push(item);
            continue;
          }
          const id = createCard({...item, columnId});
          created.push(currentCard(id));
        }
        return {created, existing};
      }
      const data = await request('/api/kanban/cards/bulk', {method: 'POST', body: {
        source: {type: 'planner', sessionId},
        sessionTitle,
        columnId,
        cards: cards.map(({assignee, ...item}) => ({...item, assigneeId: assignee?.id || null, assigneeName: assignee?.name || null})),
      }});
      for (const card of data?.created || []) server = applyServerCard(server, card);
      persist();
      emit();
      return data;
    },
    isStructureOp: type => STRUCTURE_OPS.has(type),
  };
}
