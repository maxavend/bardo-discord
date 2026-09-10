import { requireDocsSession } from './discord-auth.js';
import { canUserViewChannel, getUserChannelContext } from './discord-permissions.js';
import {
  archivePlannerSession,
  restorePlannerSession,
  deletePlannerSessionPermanently,
  listPlannerSessionsForChannel,
  listArchivedPlannerSessionsForChannel,
  loadLiveSessionState,
  loadPlannerSession,
  saveLiveSessionState,
  savePlannerSession,
} from './db.js';

const PLANNER_PREFIX = '/api/planner';
const DISCORD_CONTEXT_PATH = '/api/discord/channel-context';

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

function parsePlannerRoute(pathname) {
  if (pathname === `${PLANNER_PREFIX}/sessions` || pathname === `${PLANNER_PREFIX}/sessions/`) {
    return { type: 'sessions', collection: true };
  }
  if (!pathname.startsWith(`${PLANNER_PREFIX}/sessions/`)) return null;

  const rest = pathname.slice(`${PLANNER_PREFIX}/sessions/`.length);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 1) {
    return { type: 'sessions', collection: false, id: decodeURIComponent(parts[0]), action: null };
  }
  if (parts.length === 2 && ['live', 'restore', 'permanent'].includes(parts[1])) {
    return { type: 'sessions', collection: false, id: decodeURIComponent(parts[0]), action: parts[1] };
  }
  return null;
}

export async function handlePlannerApi(request, url, env) {
  const isContextRoute = url.pathname === DISCORD_CONTEXT_PATH;
  const plannerRoute = parsePlannerRoute(url.pathname);

  if (!isContextRoute && !plannerRoute) return null;

  const auth = await requireDocsSession(request, env);
  if (auth.error) return auth.error;
  const { session } = auth;

  if (!session.guildId || !session.channelId) {
    return json({ error: 'Discord guild and channel context required' }, 403);
  }

  const hasAccess = await canUserViewChannel(env, session.guildId, session.userId, session.channelId);
  if (!hasAccess) {
    return json({ error: 'No tienes permiso para acceder a este canal de Discord' }, 403);
  }

  // 1. Channel Context: roles, members, permissions
  if (isContextRoute && request.method === 'GET') {
    const context = await getUserChannelContext(env, session.guildId, session.userId, session.channelId);
    return json(context);
  }

  if (!env.DB) {
    return json({ error: 'Database unavailable' }, 503);
  }

  // 2. Planner Sessions Collection
  if (plannerRoute.collection) {
    if (request.method === 'GET') {
      const isArchived = url.searchParams.get('archived') === '1' || url.searchParams.get('status') === 'archived';
      const sessions = isArchived
        ? await listArchivedPlannerSessionsForChannel(env.DB, session.guildId, session.channelId, 25)
        : await listPlannerSessionsForChannel(env.DB, session.guildId, session.channelId, 25);
      return json({ sessions });
    }

    if (request.method === 'POST') {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: 'Invalid JSON payload' }, 400);
      }

      const id = (typeof payload?.id === 'string' && payload.id.trim())
        ? payload.id.trim()
        : crypto.randomUUID();

      const newSession = {
        id,
        guildId: session.guildId,
        channelId: session.channelId,
        title: String(payload.title || 'Nueva sesión').trim().slice(0, 200),
        hostId: payload.hostId || session.userId,
        hostName: payload.hostName || session.username || 'Organizador',
        date: payload.date || new Date().toISOString().split('T')[0],
        startTime: payload.startTime || '10:00',
        targetDuration: Number(payload.targetDuration || 60),
        description: String(payload.description || '').slice(0, 2000),
        mentions: String(payload.mentions || ''),
        blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
        status: payload.status || 'scheduled',
        createdBy: session.userId,
        updatedBy: session.userId,
      };

      await savePlannerSession(env.DB, newSession);
      const saved = await loadPlannerSession(env.DB, id, session.guildId, session.channelId);
      return json(saved, 201);
    }

    return new Response('Method not allowed', { status: 405 });
  }

  // 3. Live Session State
  if (plannerRoute.action === 'live') {
    const sessionId = plannerRoute.id;

    if (request.method === 'GET') {
      const liveState = await loadLiveSessionState(env.DB, sessionId);
      return json({ liveState: liveState || null });
    }

    if (request.method === 'POST' || request.method === 'PATCH') {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: 'Invalid JSON payload' }, 400);
      }

      const liveState = {
        sessionId,
        guildId: session.guildId,
        channelId: session.channelId,
        status: payload.status || 'idle',
        activeBlockId: payload.activeBlockId || null,
        activePointId: payload.activePointId || null,
        blockStartedAt: payload.blockStartedAt ? Number(payload.blockStartedAt) : null,
        blockElapsedBeforePauseMs: Number(payload.blockElapsedBeforePauseMs || 0),
        sessionStartedAt: payload.sessionStartedAt ? Number(payload.sessionStartedAt) : null,
        sessionPausedAt: payload.sessionPausedAt ? Number(payload.sessionPausedAt) : null,
        totalPausedMs: Number(payload.totalPausedMs || 0),
        decisions: Array.isArray(payload.decisions) ? payload.decisions : [],
        recordingsMeta: Array.isArray(payload.recordingsMeta) ? payload.recordingsMeta : [],
        updatedBy: session.userId,
      };

      await saveLiveSessionState(env.DB, liveState);
      return json({ ok: true, liveState });
    }

    return new Response('Method not allowed', { status: 405 });
  }

  // 4. Single Session by ID
  const sessionId = plannerRoute.id;

  if (plannerRoute.action === 'restore' && request.method === 'POST') {
    await restorePlannerSession(env.DB, sessionId, session.guildId, session.channelId, session.userId);
    return json({ ok: true, restored: true, id: sessionId });
  }

  if (plannerRoute.action === 'permanent' && request.method === 'DELETE') {
    await deletePlannerSessionPermanently(env.DB, sessionId, session.guildId, session.channelId);
    return json({ ok: true, deleted: true, id: sessionId });
  }

  if (request.method === 'GET') {
    const existing = await loadPlannerSession(env.DB, sessionId, session.guildId, session.channelId);
    if (!existing) return json({ error: 'Sesión no encontrada' }, 404);
    return json(existing);
  }

  if (request.method === 'PATCH' || request.method === 'PUT') {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid JSON payload' }, 400);
    }

    const existing = await loadPlannerSession(env.DB, sessionId, session.guildId, session.channelId);
    if (!existing) return json({ error: 'Sesión no encontrada' }, 404);

    const updated = {
      ...existing,
      ...payload,
      id: sessionId,
      guildId: session.guildId,
      channelId: session.channelId,
      blocks: Array.isArray(payload.blocks) ? payload.blocks : existing.blocks,
      updatedBy: session.userId,
      updatedAt: new Date().toISOString(),
    };

    await savePlannerSession(env.DB, updated);
    const refreshed = await loadPlannerSession(env.DB, sessionId, session.guildId, session.channelId);
    return json(refreshed);
  }

  if (request.method === 'DELETE') {
    await archivePlannerSession(env.DB, sessionId, session.guildId, session.channelId, session.userId);
    return json({ ok: true, archived: true, id: sessionId });
  }

  return new Response('Method not allowed', { status: 405 });
}
