/**
 * Planner ↔ D1 sync engine.
 *
 * Responsibilities:
 * - Debounced PATCH of the agenda (planner session) with `baseUpdatedAt`
 *   optimistic concurrency; 409 → conflict callback, 404 → POST (create).
 * - Live-state pushes scoped by an explicit planner session id (never read from
 *   localStorage at drain time), coalesced so only the latest state is sent.
 * - Retry with exponential backoff (1s, 2s, 4s… max 30s) for network/429/5xx
 *   transient errors; never retry 400/401/403/404/409/413.
 * - Pending agenda edits persist in localStorage so they survive a reload.
 * - Emits `bardo-sync-status` events with scope 'planner'.
 *
 * Pure JS (no React, no path aliases) so it can be unit-tested from Node.
 */

export const PLANNER_PENDING_KEY = 'bardo.planner.pending.v1';
// Unsent live states, per planner session id, so they survive reloads and
// agenda switches (the single live-state localStorage slot is overwritten).
export const PLANNER_PENDING_LIVE_KEY = 'bardo.planner.pending-live.v1';
// Browsers cap the sum of in-flight keepalive bodies at ~64 KB (shared with
// docs). Bigger flushes stay pending for the next boot instead.
export const KEEPALIVE_BUDGET_BYTES = 60 * 1024;
export const PLANNER_SAVE_DEBOUNCE_MS = 1000;
export const MAX_BACKOFF_MS = 30_000;

export class PlannerApiError extends Error {
  constructor(message, {status = 0, code = null, data = null, retryAfterMs = null} = {}) {
    super(message);
    this.name = 'PlannerApiError';
    this.status = status;
    this.code = code;
    this.data = data;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isRetryableStatus(status) {
  return status === 0 || status === 429 || status === 502 || status === 503 || status === 504;
}

export function backoffDelay(attempt, retryAfterMs = null) {
  const exponential = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempt));
  const hinted = Number(retryAfterMs) > 0 ? Math.min(MAX_BACKOFF_MS, Number(retryAfterMs)) : 0;
  return Math.max(exponential, hinted);
}

function hasWindow() {
  return typeof window !== 'undefined';
}

export function isPlannerRemoteEnabled() {
  if (!hasWindow()) return false;
  if (!(window.__BARDO_PRODUCTION__ || window.__BARDO_SESSION_TOKEN__)) return false;
  try {
    const params = new URLSearchParams(window.location?.search || '');
    if (params.get('demo') === '1' && !window.__BARDO_PRODUCTION__) return false;
  } catch {
    // ignore
  }
  return true;
}

export function plannerApiHeaders(extra = {}) {
  const w = hasWindow() ? window : {};
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(w.__BARDO_SESSION_TOKEN__ ? {Authorization: `Bearer ${w.__BARDO_SESSION_TOKEN__}`} : {}),
    ...(w.__BARDO_CUSTOM_ID__ ? {'x-bardo-custom-id': w.__BARDO_CUSTOM_ID__} : {}),
    ...(w.__BARDO_INSTANCE_ID__ ? {'x-bardo-instance-id': w.__BARDO_INSTANCE_ID__} : {}),
    ...extra,
  };
}

export function emitPlannerSyncStatus(id, state, message = undefined) {
  if (!hasWindow() || typeof window.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('bardo-sync-status', {
      detail: {scope: 'planner', id: id || null, state, ...(message ? {message} : {})},
    }));
  } catch {
    // Best effort UI signal.
  }
}

/**
 * fetch wrapper: resolves with parsed JSON on 2xx, throws PlannerApiError
 * otherwise (status 0 for network errors).
 */
export async function plannerRequest(path, init = {}, fetchImpl = (hasWindow() ? window.fetch?.bind(window) : globalThis.fetch)) {
  let response;
  try {
    response = await fetchImpl(path, {
      cache: 'no-store',
      ...init,
      headers: plannerApiHeaders(init.headers || {}),
    });
  } catch (error) {
    throw new PlannerApiError(error?.message || 'Sin conexión', {status: 0});
  }
  let data = null;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const retryHeader = Number(response.headers?.get?.('Retry-After'));
    const retryAfterMs = data?.retryAfterMs ?? (Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : null);
    throw new PlannerApiError(data?.message || data?.error || `HTTP ${response.status}`, {
      status: response.status,
      code: data?.error || null,
      data,
      retryAfterMs,
    });
  }
  return data;
}

/** Shape sent to PATCH/POST /api/planner/sessions. Never sends `status`. */
export function toPlannerPayload(plannerState) {
  if (!plannerState) return null;
  const host = plannerState.host ?? plannerState.hostName ?? '';
  return {
    id: plannerState.id,
    title: plannerState.title || '',
    host,
    hostName: host,
    date: plannerState.date || '',
    startTime: plannerState.startTime || '',
    targetDuration: plannerState.targetDuration ?? null,
    description: plannerState.description || '',
    mentions: plannerState.mentions || '',
    blocks: Array.isArray(plannerState.blocks) ? plannerState.blocks : [],
  };
}

function cleanDuration(value, fallback = 60) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.round(number), 24 * 60) : fallback;
}

/**
 * Applies the same defaults/truncation the server applies when storing an
 * agenda, so a local payload and its stored copy compare equal.
 */
export function normalizeComparablePayload(value) {
  const payload = toPlannerPayload(value);
  if (!payload) return null;
  return {
    title: String(payload.title ?? '').slice(0, 200).trim() || 'Nueva sesión',
    host: String(payload.host ?? '').slice(0, 200),
    date: String(payload.date ?? '').slice(0, 32),
    startTime: String(payload.startTime ?? '').slice(0, 16) || '10:00',
    targetDuration: cleanDuration(payload.targetDuration, 60),
    description: String(payload.description ?? '').slice(0, 2000),
    mentions: String(payload.mentions ?? '').slice(0, 4000),
    blocks: payload.blocks,
  };
}

/** True when two agenda payloads carry the same user-visible content. */
export function plannerPayloadsEquivalent(a, b) {
  if (!a || !b) return false;
  const left = normalizeComparablePayload(a);
  const right = normalizeComparablePayload(b);
  // The server fills an empty date with "today": an empty side matches any date.
  if (!left.date || !right.date) {
    left.date = '';
    right.date = '';
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

export function utf8ByteLength(text) {
  const value = String(text ?? '');
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return unescape(encodeURIComponent(value)).length;
}

export function describeSyncError(error) {
  const status = error?.status ?? 0;
  if (status === 0) return 'Sin conexión. Reintentando…';
  if (status === 413) return 'La reunión es demasiado grande para guardarse.';
  if (status === 401 || status === 403) return 'No tienes permiso para guardar en este canal.';
  if (status === 429 || status === 503) return 'Discord no está disponible. Reintentando…';
  return error?.message || 'No se pudo guardar.';
}

function defaultStorage() {
  try {
    return hasWindow() && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readPendingPlannerEdits(storage = defaultStorage()) {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(PLANNER_PENDING_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readPendingLiveStates(storage = defaultStorage()) {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(PLANNER_PENDING_LIVE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function createPlannerSyncEngine({
  fetchImpl,
  storage = defaultStorage(),
  setTimeoutImpl = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutImpl = (id) => clearTimeout(id),
  debounceMs = PLANNER_SAVE_DEBOUNCE_MS,
  onStatus = emitPlannerSyncStatus,
  onPlannerSaved = () => {},
  onPlannerConflict = () => {},
  onError = () => {},
} = {}) {
  const request = (path, init) => plannerRequest(path, init, fetchImpl);
  const pending = readPendingPlannerEdits(storage); // id -> {payload, baseUpdatedAt}
  const baseVersions = new Map(); // id -> server updatedAt
  const debounceTimers = new Map();
  const retryTimers = new Map();
  const attempts = new Map();
  const latestLive = new Map(Object.entries(readPendingLiveStates(storage))); // id -> serialized live state
  const resumedLive = new Set(latestLive.keys()); // loaded from storage: verify against server before sending
  const lastPlannerPayload = new Map();
  let chain = Promise.resolve();
  let disposed = false;

  for (const [id, entry] of Object.entries(pending)) {
    if (entry?.baseUpdatedAt) baseVersions.set(id, entry.baseUpdatedAt);
    if (entry?.payload) lastPlannerPayload.set(id, entry.payload);
  }

  const persistPending = () => {
    if (!storage) return;
    try {
      if (Object.keys(pending).length === 0) storage.removeItem(PLANNER_PENDING_KEY);
      else storage.setItem(PLANNER_PENDING_KEY, JSON.stringify(pending));
    } catch {
      // Storage unavailable: edits still live in memory and will be sent.
    }
  };

  const persistPendingLive = () => {
    if (!storage) return;
    try {
      if (latestLive.size === 0) storage.removeItem(PLANNER_PENDING_LIVE_KEY);
      else storage.setItem(PLANNER_PENDING_LIVE_KEY, JSON.stringify(Object.fromEntries(latestLive)));
    } catch {
      // Storage unavailable/full: state still in memory and in the live slot.
    }
  };

  const enqueue = (task) => {
    chain = chain.then(task).catch((error) => onError(error));
    return chain;
  };

  const scheduleRetry = (key, error, fn) => {
    const attempt = attempts.get(key) || 0;
    attempts.set(key, attempt + 1);
    const delay = backoffDelay(attempt, error?.retryAfterMs);
    clearTimeoutImpl(retryTimers.get(key));
    retryTimers.set(key, setTimeoutImpl(() => {
      retryTimers.delete(key);
      if (!disposed) fn();
    }, delay));
    return delay;
  };

  const createSession = async (payload) => {
    const data = await request('/api/planner/sessions', {method: 'POST', body: JSON.stringify(payload)});
    return data?.session || data;
  };

  const runPlanner = async (id) => {
    const entry = pending[id];
    if (!entry) return;
    const sentPayload = entry.payload;
    const base = baseVersions.get(id) || entry.baseUpdatedAt || null;
    onStatus(id, 'saving');
    try {
      let saved;
      try {
        const data = await request(`/api/planner/sessions/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({...sentPayload, ...(base ? {baseUpdatedAt: base} : {})}),
        });
        saved = data?.session || data;
      } catch (error) {
        if (error?.status !== 404) throw error;
        saved = await createSession(sentPayload);
      }
      attempts.delete(`planner:${id}`);
      if (saved?.updatedAt) baseVersions.set(id, saved.updatedAt);
      if (pending[id] && pending[id].payload === sentPayload) {
        delete pending[id];
      } else if (pending[id] && saved?.updatedAt) {
        pending[id].baseUpdatedAt = saved.updatedAt;
      }
      persistPending();
      onStatus(id, pending[id] ? 'saving' : 'saved');
      onPlannerSaved(saved || null, sentPayload);
    } catch (error) {
      if (error?.status === 409 && (error.code === 'conflict' || error.data?.session)) {
        const server = error.data?.session || null;
        if (server?.updatedAt) baseVersions.set(id, server.updatedAt);
        const localPayload = pending[id]?.payload || sentPayload;
        delete pending[id];
        persistPending();
        if (server && plannerPayloadsEquivalent(localPayload, server)) {
          // Our own earlier write (e.g. a keepalive flush) already landed.
          onStatus(id, 'saved');
          onPlannerSaved(server, localPayload);
          return;
        }
        onStatus(id, 'conflict', 'Otra persona modificó esta reunión.');
        onPlannerConflict({id, local: localPayload, server});
        return;
      }
      if (isRetryableStatus(error?.status)) {
        onStatus(id, error.status === 0 ? 'offline' : 'error', describeSyncError(error));
        scheduleRetry(`planner:${id}`, error, () => flushPlanner(id));
        return;
      }
      onStatus(id, 'error', describeSyncError(error));
      onError(error);
    }
  };

  function flushPlanner(id) {
    clearTimeoutImpl(debounceTimers.get(id));
    debounceTimers.delete(id);
    return enqueue(() => runPlanner(id));
  }

  const schedulePlannerSave = (plannerState, {immediate = false} = {}) => {
    const payload = toPlannerPayload(plannerState);
    if (!payload?.id || disposed) return Promise.resolve();
    if (!baseVersions.has(payload.id) && plannerState.updatedAt) {
      baseVersions.set(payload.id, plannerState.updatedAt);
    }
    pending[payload.id] = {payload, baseUpdatedAt: baseVersions.get(payload.id) || null, queuedAt: Date.now()};
    lastPlannerPayload.set(payload.id, payload);
    persistPending();
    onStatus(payload.id, 'saving');
    clearTimeoutImpl(debounceTimers.get(payload.id));
    if (immediate) return flushPlanner(payload.id);
    debounceTimers.set(payload.id, setTimeoutImpl(() => {
      debounceTimers.delete(payload.id);
      flushPlanner(payload.id);
    }, debounceMs));
    return Promise.resolve();
  };

  const runLive = async (plannerSessionId) => {
    const state = latestLive.get(plannerSessionId);
    if (!state) return;
    // Agenda edits must land first so the session row exists server-side.
    if (pending[plannerSessionId]) await runPlanner(plannerSessionId);
    try {
      if (resumedLive.has(plannerSessionId)) {
        // A state left over from a previous page must not overwrite newer
        // progress made meanwhile by another participant.
        let remote = null;
        try {
          remote = (await request(`/api/planner/sessions/${encodeURIComponent(plannerSessionId)}/live`, {method: 'GET'}))?.liveState || null;
        } catch (error) {
          if (error?.status !== 404) throw error;
        }
        resumedLive.delete(plannerSessionId);
        const remoteTime = Date.parse(remote?.updatedAt || '') || 0;
        const localTime = Date.parse(state.updatedAt || '') || 0;
        if (remote && remoteTime >= localTime) {
          if (latestLive.get(plannerSessionId) === state) latestLive.delete(plannerSessionId);
          persistPendingLive();
          return;
        }
      }
      try {
        await request(`/api/planner/sessions/${encodeURIComponent(plannerSessionId)}/live`, {
          method: 'POST',
          body: JSON.stringify(state),
        });
      } catch (error) {
        const snapshot = lastPlannerPayload.get(plannerSessionId);
        if (error?.status !== 404 || !snapshot) throw error;
        await createSession(snapshot);
        await request(`/api/planner/sessions/${encodeURIComponent(plannerSessionId)}/live`, {
          method: 'POST',
          body: JSON.stringify(state),
        });
      }
      attempts.delete(`live:${plannerSessionId}`);
      if (latestLive.get(plannerSessionId) === state) latestLive.delete(plannerSessionId);
      persistPendingLive();
      if (!pending[plannerSessionId]) onStatus(plannerSessionId, 'saved');
    } catch (error) {
      if (isRetryableStatus(error?.status)) {
        onStatus(plannerSessionId, error.status === 0 ? 'offline' : 'error', describeSyncError(error));
        scheduleRetry(`live:${plannerSessionId}`, error, () => enqueue(() => runLive(plannerSessionId)));
        return;
      }
      onStatus(plannerSessionId, 'error', describeSyncError(error));
      onError(error);
    }
  };

  const pushLiveState = (plannerSessionId, serializedState) => {
    if (!plannerSessionId || !serializedState || disposed) return Promise.resolve();
    latestLive.set(plannerSessionId, serializedState);
    resumedLive.delete(plannerSessionId);
    persistPendingLive();
    onStatus(plannerSessionId, 'saving');
    return enqueue(() => runLive(plannerSessionId));
  };

  /**
   * Persists a live state that cannot be sent yet (server copy not read yet)
   * so it survives reloads/agenda switches. It is verified against the server
   * before being sent (never overwrites newer remote progress).
   */
  const stageLiveState = (plannerSessionId, serializedState) => {
    if (!plannerSessionId || !serializedState || disposed) return;
    latestLive.set(plannerSessionId, serializedState);
    resumedLive.add(plannerSessionId);
    persistPendingLive();
  };

  const fetchRemoteLive = async (plannerSessionId) => {
    const data = await request(`/api/planner/sessions/${encodeURIComponent(plannerSessionId)}/live`, {method: 'GET'});
    return data?.liveState || null;
  };

  const fetchRemoteSession = async (plannerSessionId) => {
    const data = await request(`/api/planner/sessions/${encodeURIComponent(plannerSessionId)}`, {method: 'GET'});
    return data?.session || data || null;
  };

  const createConflictCopy = async (localPayload, newId) => {
    const copy = {
      ...localPayload,
      id: newId,
      title: `${localPayload?.title || 'Reunión'} (copia en conflicto)`,
    };
    lastPlannerPayload.set(newId, copy);
    return createSession(copy);
  };

  /**
   * Sends pending agenda edits and live states now (pagehide). Requests are
   * keepalive and limited to KEEPALIVE_BUDGET_BYTES in total; anything that
   * does not fit stays pending in localStorage and is re-sent on next boot.
   * Returns the list of {kind, id, bytes, sent}.
   */
  const flushAllKeepalive = ({budgetBytes = KEEPALIVE_BUDGET_BYTES} = {}) => {
    const fetcher = fetchImpl || (hasWindow() ? window.fetch?.bind(window) : globalThis.fetch);
    const report = [];
    let used = 0;
    const send = (kind, id, path, method, body) => {
      const bytes = utf8ByteLength(body);
      const fits = used + bytes <= budgetBytes;
      report.push({kind, id, bytes, sent: fits});
      if (!fits || typeof fetcher !== 'function') return;
      used += bytes;
      try {
        void Promise.resolve(fetcher(path, {method, keepalive: true, headers: plannerApiHeaders(), body})).catch(() => {});
      } catch {
        // Stays pending in localStorage.
      }
    };
    for (const [id, entry] of Object.entries(pending)) {
      const base = baseVersions.get(id) || entry.baseUpdatedAt || null;
      send('planner', id, `/api/planner/sessions/${encodeURIComponent(id)}`, 'PATCH',
        JSON.stringify({...entry.payload, ...(base ? {baseUpdatedAt: base} : {})}));
    }
    for (const [id, state] of latestLive.entries()) {
      send('live', id, `/api/planner/sessions/${encodeURIComponent(id)}/live`, 'POST', JSON.stringify(state));
    }
    return report;
  };

  const resumePending = () => {
    for (const id of Object.keys(pending)) flushPlanner(id);
    for (const id of latestLive.keys()) enqueue(() => runLive(id));
  };

  const rememberSnapshot = (plannerState) => {
    const payload = toPlannerPayload(plannerState);
    if (payload?.id) lastPlannerPayload.set(payload.id, payload);
  };

  return {
    schedulePlannerSave,
    rememberSnapshot,
    ensurePlannerPersisted: (plannerState) => schedulePlannerSave(plannerState, {immediate: true}),
    flushPlanner,
    pushLiveState,
    stageLiveState,
    fetchRemoteLive,
    fetchRemoteSession,
    createConflictCopy,
    flushAllKeepalive,
    resumePending,
    hasPendingPlanner: (id) => Boolean(pending[id]) || debounceTimers.has(id),
    getPendingLive: (id) => latestLive.get(id) || null,
    setBaseVersion: (id, updatedAt) => {
      if (id && updatedAt) baseVersions.set(id, updatedAt);
    },
    whenIdle: () => chain,
    dispose: () => {
      // Debounced edits are flushed (not dropped); retries stop but the edit
      // remains in localStorage and is re-sent by the next engine instance.
      for (const id of [...debounceTimers.keys()]) flushPlanner(id);
      disposed = true;
      for (const timer of retryTimers.values()) clearTimeoutImpl(timer);
      retryTimers.clear();
    },
  };
}
