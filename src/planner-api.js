import { requireDocsSession } from './discord-auth.js';
import {
  canUserViewChannel,
  discordUnavailableResponse,
  getUserChannelContext,
  isDiscordUnavailableError,
} from './discord-permissions.js';
import {
  archivePlannerSession,
  restorePlannerSession,
  deletePlannerSessionPermanently,
  listPlannerSessionsForChannel,
  listArchivedPlannerSessionsForChannel,
  loadLiveSessionState,
  loadPlannerSession,
  loadPlannerSessionOwner,
  saveLiveSessionState,
  savePlannerSession,
  updatePlannerSession,
} from './db.js';

const PLANNER_PREFIX = '/api/planner';
const DISCORD_CONTEXT_PATH = '/api/discord/channel-context';
export const MAX_PLANNER_JSON_BYTES = 512 * 1024;
const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function apiError(status, error, message, extra = {}) {
  return json({ error, ...(message ? { message } : {}), ...extra }, status);
}

const notFound = () => apiError(404, 'not_found', 'No se encontró la reunión en este canal.');

function parsePlannerRoute(pathname) {
  if (pathname === `${PLANNER_PREFIX}/sessions` || pathname === `${PLANNER_PREFIX}/sessions/`) {
    return { type: 'sessions', collection: true };
  }
  if (!pathname.startsWith(`${PLANNER_PREFIX}/sessions/`)) return null;

  const rest = pathname.slice(`${PLANNER_PREFIX}/sessions/`.length);
  const parts = rest.split('/').filter(Boolean);
  let id;
  try {
    id = parts[0] ? decodeURIComponent(parts[0]).trim() : '';
  } catch {
    return { invalid: true };
  }
  if (!id) return null;
  if (parts.length === 1) {
    return { type: 'sessions', collection: false, id, action: null };
  }
  if (parts.length === 2 && ['live', 'restore', 'permanent'].includes(parts[1])) {
    return { type: 'sessions', collection: false, id, action: parts[1] };
  }
  return null;
}

/** Reads a JSON body enforcing the 512 KB planner limit on the raw bytes. */
async function readJsonBody(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    return { error: apiError(400, 'invalid_json', 'No se pudo leer el cuerpo de la solicitud.') };
  }
  if (encoder.encode(text).byteLength > MAX_PLANNER_JSON_BYTES) {
    return { error: apiError(413, 'too_large', 'La reunión supera el tamaño máximo permitido (512 KB).') };
  }
  try {
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('not an object');
    return { payload, text };
  } catch {
    return { error: apiError(400, 'invalid_json', 'El cuerpo de la solicitud no es JSON válido.') };
  }
}

function jsonFieldTooLarge(...values) {
  return values.some(value => encoder.encode(JSON.stringify(value ?? null)).byteLength > MAX_PLANNER_JSON_BYTES);
}

function nextUpdatedAt(previous) {
  const previousMs = Date.parse(previous || '') || 0;
  return new Date(Math.max(Date.now(), previousMs + 1)).toISOString();
}

function cleanString(value, max) {
  return value === undefined || value === null ? undefined : String(value).slice(0, max);
}

function cleanDuration(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.round(number), 24 * 60) : fallback;
}

/**
 * Status changes coming from the editor. 'archived' can only be set/cleared
 * through the archive/restore endpoints, never by a PATCH/POST body.
 */
function resolveStatus(requested, current) {
  if (current === 'archived') return 'archived';
  if (typeof requested !== 'string' || !requested.trim()) return current || 'scheduled';
  const status = requested.trim().slice(0, 32);
  return status === 'archived' ? (current || 'scheduled') : status;
}

/** Maps a client payload onto the stored session, accepting `host` as alias of `hostName`. */
function sessionFromPayload(payload, base, session) {
  const hostName = payload.hostName ?? payload.host;
  return {
    ...base,
    title: cleanString(payload.title, 200)?.trim() || base.title || 'Nueva sesión',
    hostId: payload.hostId !== undefined ? cleanString(payload.hostId, 64) || null : base.hostId ?? session.userId,
    hostName: hostName !== undefined ? cleanString(hostName, 200) || null : base.hostName ?? (session.username || 'Organizador'),
    date: cleanString(payload.date, 32) || base.date || new Date().toISOString().split('T')[0],
    startTime: cleanString(payload.startTime, 16) || base.startTime || '10:00',
    targetDuration: cleanDuration(payload.targetDuration, base.targetDuration || 60),
    description: payload.description !== undefined ? cleanString(payload.description, 2000) : (base.description || ''),
    mentions: payload.mentions !== undefined ? cleanString(payload.mentions, 4000) : (base.mentions || ''),
    blocks: Array.isArray(payload.blocks) ? payload.blocks : (base.blocks || []),
    status: resolveStatus(payload.status, base.status),
  };
}

async function handleCollection(request, url, env, session) {
  if (request.method === 'GET') {
    const isArchived = url.searchParams.get('archived') === '1' || url.searchParams.get('status') === 'archived';
    const sessions = isArchived
      ? await listArchivedPlannerSessionsForChannel(env.DB, session.guildId, session.channelId, 25)
      : await listPlannerSessionsForChannel(env.DB, session.guildId, session.channelId, 25);
    return json({ sessions });
  }

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await readJsonBody(request);
  if (body.error) return body.error;
  const payload = body.payload;
  if (jsonFieldTooLarge(payload.blocks, payload.decisions)) {
    return apiError(413, 'too_large', 'La reunión supera el tamaño máximo permitido (512 KB).');
  }

  const id = (typeof payload.id === 'string' && payload.id.trim())
    ? payload.id.trim().slice(0, 128)
    : crypto.randomUUID();

  const owner = await loadPlannerSessionOwner(env.DB, id);
  if (owner && (owner.guildId !== session.guildId || owner.channelId !== session.channelId)) {
    return apiError(409, 'exists', 'Ya existe una reunión con ese identificador en otro canal.');
  }

  const existing = owner ? await loadPlannerSession(env.DB, id, session.guildId, session.channelId) : null;
  const now = nextUpdatedAt(existing?.updatedAt);
  const record = {
    ...sessionFromPayload(payload, existing || {}, session),
    id,
    guildId: session.guildId,
    channelId: session.channelId,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || session.userId,
    updatedAt: now,
    updatedBy: session.userId,
  };

  const written = await savePlannerSession(env.DB, record);
  if (!written) return apiError(409, 'exists', 'Ya existe una reunión con ese identificador en otro canal.');

  const saved = await loadPlannerSession(env.DB, id, session.guildId, session.channelId);
  // `session` is the canonical key; the flat fields are kept for older clients.
  return json({ ...saved, session: saved }, existing ? 200 : 201);
}

/** Derives the legacy live columns from the full client state when possible. */
function legacyLiveColumns(payload) {
  const number = value => (value === null || value === undefined || value === '' ? null : Number(value) || null);
  const recordings = Array.isArray(payload.recordings)
    ? payload.recordings
    : (Array.isArray(payload.recordingsMeta) ? payload.recordingsMeta : []);
  return {
    status: typeof payload.status === 'string' ? payload.status.slice(0, 32) : 'idle',
    activeBlockId: payload.liveActiveBlockId ?? payload.activeBlockId ?? null,
    activePointId: payload.liveActivePointId ?? payload.activePointId ?? null,
    blockStartedAt: number(payload.activeBlockStartedAt ?? payload.blockStartedAt),
    blockElapsedBeforePauseMs: Number(payload.blockElapsedBeforePauseMs || 0),
    sessionStartedAt: number(payload.sessionStartedAt),
    sessionPausedAt: number(payload.pausedAt ?? payload.sessionPausedAt),
    totalPausedMs: Number(payload.accumulatedPausedMs ?? payload.totalPausedMs ?? 0) || 0,
    decisions: Array.isArray(payload.decisions) ? payload.decisions : [],
    recordingsMeta: recordings,
  };
}

async function handleLive(request, env, session, sessionId) {
  const meeting = await loadPlannerSession(env.DB, sessionId, session.guildId, session.channelId);
  if (!meeting) return notFound();

  if (request.method === 'GET') {
    const liveState = await loadLiveSessionState(env.DB, sessionId);
    return json({ liveState: liveState || null });
  }

  if (request.method !== 'POST' && request.method !== 'PATCH') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await readJsonBody(request);
  if (body.error) return body.error;
  // Keep the client's own `sessionId` (its recording run id); the planner id
  // is stored as `plannerSessionId` so recordings can be recovered by run id.
  const payload = { ...body.payload, plannerSessionId: sessionId };
  if (typeof payload.sessionId !== 'string' || !payload.sessionId) payload.sessionId = sessionId;
  if (typeof payload.updatedAt !== 'string' || !payload.updatedAt) payload.updatedAt = new Date().toISOString();
  const stateJson = JSON.stringify(payload);
  if (encoder.encode(stateJson).byteLength > MAX_PLANNER_JSON_BYTES) {
    return apiError(413, 'too_large', 'El estado de la reunión supera el tamaño máximo permitido (512 KB).');
  }

  const columns = legacyLiveColumns(payload);
  try {
    await saveLiveSessionState(env.DB, {
      ...columns,
      sessionId,
      guildId: session.guildId,
      channelId: session.channelId,
      updatedBy: session.userId,
      stateJson,
    });
  } catch (error) {
    // The meeting may have been deleted between the check and the write.
    if (/FOREIGN KEY constraint failed/i.test(String(error?.message))) return notFound();
    throw error;
  }

  const liveState = await loadLiveSessionState(env.DB, sessionId);
  return json({ ok: true, liveState });
}

async function handleSingle(request, env, session, route) {
  const sessionId = route.id;

  // Ownership is verified before ANY mutation (including deletes).
  const existing = await loadPlannerSession(env.DB, sessionId, session.guildId, session.channelId);
  if (!existing) return notFound();

  if (route.action === 'restore') {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    await restorePlannerSession(env.DB, sessionId, session.guildId, session.channelId, session.userId);
    return json({ ok: true, restored: true, id: sessionId });
  }

  if (route.action === 'permanent') {
    if (request.method !== 'DELETE') return new Response('Method not allowed', { status: 405 });
    const deleted = await deletePlannerSessionPermanently(env.DB, sessionId, session.guildId, session.channelId);
    if (!deleted) return notFound();
    return json({ ok: true, deleted: true, id: sessionId });
  }

  if (request.method === 'GET') return json(existing);

  if (request.method === 'PATCH' || request.method === 'PUT') {
    const body = await readJsonBody(request);
    if (body.error) return body.error;
    const payload = body.payload;
    if (jsonFieldTooLarge(payload.blocks, payload.decisions)) {
      return apiError(413, 'too_large', 'La reunión supera el tamaño máximo permitido (512 KB).');
    }

    const baseUpdatedAt = typeof payload.baseUpdatedAt === 'string' && payload.baseUpdatedAt.trim()
      ? payload.baseUpdatedAt.trim()
      : null;
    if (baseUpdatedAt && baseUpdatedAt !== existing.updatedAt) {
      return apiError(409, 'conflict', 'Otra persona guardó cambios en esta reunión.', { session: existing });
    }

    const updated = {
      ...sessionFromPayload(payload, existing, session),
      id: sessionId,
      guildId: session.guildId,
      channelId: session.channelId,
      updatedBy: session.userId,
      updatedAt: nextUpdatedAt(existing.updatedAt),
    };

    const written = await updatePlannerSession(env.DB, updated, { baseUpdatedAt: baseUpdatedAt || existing.updatedAt });
    const refreshed = await loadPlannerSession(env.DB, sessionId, session.guildId, session.channelId);
    if (!written) {
      if (!refreshed) return notFound();
      return apiError(409, 'conflict', 'Otra persona guardó cambios en esta reunión.', { session: refreshed });
    }
    return json({ session: refreshed });
  }

  if (request.method === 'DELETE') {
    await archivePlannerSession(env.DB, sessionId, session.guildId, session.channelId, session.userId);
    return json({ ok: true, archived: true, id: sessionId });
  }

  return new Response('Method not allowed', { status: 405 });
}

async function routePlannerApi(request, url, env) {
  const isContextRoute = url.pathname === DISCORD_CONTEXT_PATH;
  const plannerRoute = parsePlannerRoute(url.pathname);

  if (!isContextRoute && !plannerRoute) return null;
  if (plannerRoute?.invalid) return apiError(400, 'invalid_route', 'Identificador de reunión inválido.');

  const auth = await requireDocsSession(request, env);
  if (auth.error) return auth.error;
  const { session } = auth;

  if (!session.guildId || !session.channelId) {
    return apiError(403, 'channel_required', 'Abre Bardo desde un canal de Discord.');
  }

  const hasAccess = await canUserViewChannel(env, session.guildId, session.userId, session.channelId);
  if (!hasAccess) {
    return apiError(403, 'forbidden', 'No tienes permiso para acceder a este canal de Discord.');
  }

  // 1. Channel Context: roles, members, permissions
  if (isContextRoute && request.method === 'GET') {
    const context = await getUserChannelContext(env, session.guildId, session.userId, session.channelId);
    return json(context);
  }
  if (isContextRoute) return new Response('Method not allowed', { status: 405 });

  if (!env.DB) {
    return apiError(503, 'database_unavailable', 'La base de datos de Bardo no está disponible.');
  }

  if (plannerRoute.collection) return handleCollection(request, url, env, session);
  if (plannerRoute.action === 'live') return handleLive(request, env, session, plannerRoute.id);
  return handleSingle(request, env, session, plannerRoute);
}

export async function handlePlannerApi(request, url, env) {
  try {
    return await routePlannerApi(request, url, env);
  } catch (error) {
    if (isDiscordUnavailableError(error)) return discordUnavailableResponse(error);
    throw error;
  }
}
