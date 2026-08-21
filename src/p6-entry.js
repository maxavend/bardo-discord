import p5Entry from './p5-entry.js';
import { ACTIVITY_ACTIONS, verifyActivityAccess } from './auth/activity-access.js';
import { loadBoardWithTasks, listBoards } from './kanban-db.js';
import { loadEventFull } from './event-db.js';
import {
  emitStructuredLog,
  errorCode,
  requestIdFor,
  requestLogFields,
} from './lib/observability.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

async function resourceEtag(kind, parts) {
  const source = `${kind}:${parts.map((part) => String(part ?? '')).join('|')}`;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)));
  const token = [...digest.slice(0, 10)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `"bardo-${kind}-${token}"`;
}

function notModified(etag) {
  return new Response(null, {
    status: 304,
    headers: {
      ETag: etag,
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function decodeResource(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  if (!rest || rest.includes('/')) return null;
  try { return decodeURIComponent(rest); } catch { return null; }
}

async function authorizeResource(request, env, action, resourceType, resourceId, guildId = null) {
  return verifyActivityAccess(request, env, { action, resourceType, resourceId, guildId });
}

async function handleBoardRead(request, url, env) {
  if (request.method !== 'GET') return null;
  const boardId = decodeResource(url.pathname, '/api/boards/');
  if (!boardId) return null;

  const initialAccess = await authorizeResource(request, env, ACTIVITY_ACTIONS.BOARD_READ, 'board', boardId);
  if (!initialAccess.ok) return initialAccess.response;
  const board = await loadBoardWithTasks(env.DB, boardId);
  if (!board) return json({ error: 'Board not found' }, 404);
  const access = await authorizeResource(request, env, ACTIVITY_ACTIONS.BOARD_READ, 'board', boardId, board.guildId || null);
  if (!access.ok) return access.response;

  const etag = await resourceEtag('board', [board.updatedAt, board.tasks?.length || 0]);
  if (request.headers.get('if-none-match') === etag) return notModified(etag);
  return json(board, 200, { ETag: etag });
}

async function handleEventRead(request, url, env) {
  if (request.method !== 'GET') return null;
  const eventId = decodeResource(url.pathname, '/api/events/');
  if (!eventId) return null;

  const initialAccess = await authorizeResource(request, env, ACTIVITY_ACTIONS.EVENT_READ, 'event', eventId);
  if (!initialAccess.ok) return initialAccess.response;
  const event = await loadEventFull(env.DB, eventId);
  if (!event) return json({ error: 'Event not found' }, 404);
  const access = await authorizeResource(request, env, ACTIVITY_ACTIONS.EVENT_READ, 'event', eventId, event.guildId || null);
  if (!access.ok) return access.response;

  const boards = event.guildId ? await listBoards(env.DB, event.guildId, 50) : [];
  const etag = await resourceEtag('event', [
    event.updatedAt,
    event.blocks?.length || 0,
    event.tasks?.length || 0,
    ...boards.map((board) => `${board.id}:${board.updatedAt}`),
  ]);
  if (request.headers.get('if-none-match') === etag) return notModified(etag);
  return json({ ...event, boards }, 200, { ETag: etag });
}

async function optimizedRead(request, env) {
  const url = new URL(request.url);
  const board = await handleBoardRead(request, url, env);
  if (board) return board;
  return handleEventRead(request, url, env);
}

function ownPostResponse(ctx, promise) {
  const safe = promise.catch((error) => console.error(JSON.stringify({ event: 'observability.failure', errorCode: errorCode(error) })));
  if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(safe);
  return safe;
}

async function logResponse(request, response, env, requestId, startedAt) {
  const fields = await requestLogFields(request, env, requestId, response, startedAt);
  await emitStructuredLog('http.request', fields, env, response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'log');
  if (response.status === 401 || response.status === 403) await emitStructuredLog('auth.denied', fields, env, 'warn');
  else if (response.status === 409 && fields.entityType === 'document') await emitStructuredLog('editor.conflict', fields, env, 'warn');
  else if (response.status >= 400 && fields.route === '/api/documents/:id/export') await emitStructuredLog('export.failure', fields, env, 'error');
  else if (response.status >= 500) await emitStructuredLog('api.error', fields, env, 'error');
}

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    const startedAt = Date.now();
    const requestId = requestIdFor(request);
    try {
      const response = await optimizedRead(request, env) || await p5Entry.fetch(request, env, ctx);
      const work = logResponse(request, response, env, requestId, startedAt);
      if (typeof ctx?.waitUntil === 'function') ownPostResponse(ctx, work);
      else await work;
      return response;
    } catch (error) {
      const url = new URL(request.url);
      const fields = {
        requestId,
        route: url.pathname.startsWith('/api/') ? '/api/exception' : 'asset-or-page',
        status: 500,
        durationMs: Math.max(0, Date.now() - startedAt),
        errorCode: errorCode(error),
      };
      const metric = fields.errorCode === 'D1_FAILURE' ? 'd1.failure' : 'worker.exception';
      await emitStructuredLog(metric, fields, env, 'error');
      throw error;
    }
  },

  async scheduled(event, env, ctx = { waitUntil: () => {} }) {
    const scheduledAt = Number(event?.scheduledTime || Date.now());
    const result = await p5Entry.scheduled(event, env, ctx);
    const metric = event?.cron === '*/5 * * * *' ? 'reminder.lag' : 'cron.tick';
    const work = emitStructuredLog(metric, {
      requestId: crypto.randomUUID(),
      route: 'scheduled',
      entityType: 'cron',
      status: 200,
      durationMs: 0,
      lagMs: Math.max(0, Date.now() - scheduledAt),
      cron: event?.cron || 'unknown',
    }, env);
    if (typeof ctx?.waitUntil === 'function') ownPostResponse(ctx, work);
    else await work;
    return result;
  },
};
