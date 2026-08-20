import eventWorker from './event-worker.js';
import {
  ColumnTasksRequireDestinationError,
  loadBoard,
  loadBoardWithTasks,
  loadTask,
  updateBoardColumns,
  updateBoardSettings,
} from './kanban-db.js';
import { loadEvent } from './event-db.js';
import {
  replaceParticipantsAtomic,
  reorderBlocksAtomic,
  reorderItemsAtomic,
} from './event-integrity.js';
import { normalizeDocumentId } from './document-id.js';
import { parseEventTarget } from './event.js';
import { handleDiscordOAuthExchange } from './auth/discord-oauth.js';
import {
  ACTIVITY_ACTIONS,
  verifyActivityAccess,
  verifySessionResource,
} from './auth/activity-access.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function parsePathParts(pathname, prefix) {
  const rest = pathname.slice(prefix.length).replace(/^\//, '');
  if (!rest) return [];
  const parts = [];
  for (const part of rest.split('/').filter(Boolean)) {
    try { parts.push(decodeURIComponent(part)); } catch { return null; }
  }
  return parts;
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function columnConflict(error) {
  return jsonResponse({
    error: error.message,
    code: error.code,
    removedColumnIds: error.removedColumnIds,
    affectedCount: error.affectedCount,
    destinations: error.destinations,
    suggestedDestinationId: error.suggestedDestinationId,
  }, 409);
}

async function authorizeDocument(request, env, url) {
  const parts = parsePathParts(url.pathname, '/api/documents');
  if (!parts?.length) return { response: jsonResponse({ error: 'Invalid document route' }, 400) };
  const documentId = normalizeDocumentId(parts[0]);
  if (!documentId) return { response: jsonResponse({ error: 'Invalid document route' }, 400) };
  const action = parts[1] || null;
  let permission = ACTIVITY_ACTIONS.DOCUMENT_READ;
  if (request.method === 'PATCH' && !action) permission = ACTIVITY_ACTIONS.DOCUMENT_EDIT;
  else if (request.method === 'GET' && (action === 'export' || action === 'download')) permission = ACTIVITY_ACTIONS.DOCUMENT_EXPORT;
  else if (request.method === 'GET' && action === 'source') permission = ACTIVITY_ACTIONS.DOCUMENT_SOURCE;
  else if (request.method === 'POST' && action === 'normalize') permission = ACTIVITY_ACTIONS.DOCUMENT_NORMALIZE;

  const access = await verifyActivityAccess(request, env, {
    action: permission,
    resourceType: 'document',
    resourceId: documentId,
  });
  return access.ok ? { access, documentId } : { response: access.response };
}

async function authorizeBoard(request, env, url) {
  const parts = parsePathParts(url.pathname, '/api/boards');
  if (!parts?.length) return { response: jsonResponse({ error: 'Invalid board route' }, 400) };
  const boardId = parts[0];
  const subroute = parts[1] || null;
  let permission = ACTIVITY_ACTIONS.BOARD_READ;
  if (subroute === 'guild-members') permission = ACTIVITY_ACTIONS.MEMBER_READ;
  else if (subroute === 'guild-roles') permission = ACTIVITY_ACTIONS.ROLE_READ;
  else if (subroute === 'tasks') permission = ACTIVITY_ACTIONS.TASK_WRITE;
  else if (request.method !== 'GET') permission = ACTIVITY_ACTIONS.BOARD_WRITE;

  const access = await verifyActivityAccess(request, env, {
    action: permission,
    resourceType: 'board',
    resourceId: boardId,
  });
  if (!access.ok) return { response: access.response };

  const board = await loadBoard(env.DB, boardId);
  if (!board) return { response: jsonResponse({ error: 'Not found' }, 404) };
  const guildError = verifySessionResource(access, {
    resourceType: 'board',
    resourceId: boardId,
    guildId: board.guildId,
  });
  return guildError ? { response: guildError } : { access, board, boardId, subroute };
}

async function authorizeTask(request, env, url) {
  const parts = parsePathParts(url.pathname, '/api/tasks');
  if (!parts?.length) return { response: jsonResponse({ error: 'Invalid task route' }, 400) };
  const access = await verifyActivityAccess(request, env, { action: ACTIVITY_ACTIONS.TASK_WRITE });
  if (!access.ok) return { response: access.response };

  const task = await loadTask(env.DB, parts[0]);
  if (!task) return { response: jsonResponse({ error: 'Not found' }, 404) };
  const board = await loadBoard(env.DB, task.boardId);
  if (!board) return { response: jsonResponse({ error: 'Not found' }, 404) };
  const resourceError = verifySessionResource(access, {
    resourceType: 'board',
    resourceId: task.boardId,
    guildId: board.guildId,
  });
  return resourceError ? { response: resourceError } : { access, task, board };
}

async function authorizeEvents(request, env, url) {
  const parts = parsePathParts(url.pathname, '/api/events');
  if (parts === null) return { response: jsonResponse({ error: 'Invalid event route' }, 400) };
  const permission = request.method === 'GET' ? ACTIVITY_ACTIONS.EVENT_READ : ACTIVITY_ACTIONS.EVENT_WRITE;

  if (parts.length === 0) {
    const access = await verifyActivityAccess(request, env, { action: permission });
    if (!access.ok) return { response: access.response };
    const contextEventId = parseEventTarget(access.context.documentId);
    if (!contextEventId) return { response: jsonResponse({ error: 'Activity authorization required' }, 403) };
    const event = await loadEvent(env.DB, contextEventId);
    if (!event) return { response: jsonResponse({ error: 'Not found' }, 404) };
    const resourceError = verifySessionResource(access, {
      resourceType: 'event',
      resourceId: contextEventId,
      guildId: event.guildId,
    });
    return resourceError ? { response: resourceError } : { access, event, parts };
  }

  const eventId = parts[0];
  const access = await verifyActivityAccess(request, env, {
    action: permission,
    resourceType: 'event',
    resourceId: eventId,
  });
  if (!access.ok) return { response: access.response };
  const event = await loadEvent(env.DB, eventId);
  if (!event) return { response: jsonResponse({ error: 'Not found' }, 404) };
  const resourceError = verifySessionResource(access, {
    resourceType: 'event',
    resourceId: eventId,
    guildId: event.guildId,
  });
  return resourceError ? { response: resourceError } : { access, event, parts };
}

async function authorizeActivityContext(request, env, url) {
  const parts = parsePathParts(url.pathname, '/api/activity-context');
  if (!parts?.length || parts.length !== 1) return { response: jsonResponse({ error: 'Invalid context route' }, 400) };
  const access = await verifyActivityAccess(request, env, {
    action: ACTIVITY_ACTIONS.CONTEXT_READ,
    resourceType: 'context',
    resourceId: parts[0],
  });
  return access.ok ? { access } : { response: access.response };
}

async function handleSecuredBoardMutation(request, env, result) {
  const confirmationDestination = request.headers.get('x-bardo-confirm-column-move')?.trim() || null;

  if (request.method === 'PATCH' && !result.subroute) {
    const payload = await readJson(request);
    if (!payload) return jsonResponse({ error: 'Invalid JSON payload' }, 400);

    const keys = Object.keys(payload);
    if (keys.length === 1 && keys[0] === 'members') {
      return jsonResponse({ ok: true, board: result.board, membershipMutationIgnored: true });
    }

    try {
      const updated = await updateBoardSettings(env.DB, result.boardId, {
        name: payload.name,
        description: payload.description,
        members: payload.members,
        columns: payload.columns,
      }, { moveTasksTo: confirmationDestination });
      return jsonResponse({ ok: true, board: updated });
    } catch (error) {
      if (error instanceof ColumnTasksRequireDestinationError || error?.code === 'COLUMN_HAS_TASKS') return columnConflict(error);
      return jsonResponse({ error: error instanceof Error ? error.message : 'Board update failed' }, 400);
    }
  }

  if ((request.method === 'PATCH' || request.method === 'PUT') && result.subroute === 'columns') {
    const payload = await readJson(request);
    if (!Array.isArray(payload?.columns)) return jsonResponse({ error: 'Se requiere un array de columnas' }, 400);
    try {
      const updated = await updateBoardColumns(env.DB, result.boardId, payload.columns, {
        moveTasksTo: confirmationDestination,
      });
      return jsonResponse({ ok: true, board: updated });
    } catch (error) {
      if (error instanceof ColumnTasksRequireDestinationError || error?.code === 'COLUMN_HAS_TASKS') return columnConflict(error);
      return jsonResponse({ error: error instanceof Error ? error.message : 'Column update failed' }, 400);
    }
  }

  return null;
}

async function handleSecuredEventIntegrityMutation(request, env, result) {
  const parts = result.parts || [];
  if (!parts.length) return null;
  const eventId = parts[0];
  const action = parts[1] || null;

  if (action === 'participants' && request.method === 'PUT') {
    const payload = await readJson(request);
    if (!payload || !Array.isArray(payload.participants)) return jsonResponse({ error: 'participants debe ser un array' }, 400);
    try {
      const participants = await replaceParticipantsAtomic(env.DB, eventId, payload.participants);
      return jsonResponse({ ok: true, participants });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'Participant update failed' }, 400);
    }
  }

  if (action === 'reorder-blocks' && request.method === 'POST') {
    const payload = await readJson(request);
    try {
      const blocks = await reorderBlocksAtomic(env.DB, eventId, payload?.ids);
      return jsonResponse({ ok: true, blocks });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'Block reorder failed' }, 400);
    }
  }

  if (action === 'reorder-items' && request.method === 'POST') {
    const payload = await readJson(request);
    try {
      const items = await reorderItemsAtomic(env.DB, eventId, payload?.blockId, payload?.ids);
      return jsonResponse({ ok: true, items });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'Item reorder failed' }, 400);
    }
  }

  if (!action && request.method === 'PATCH') {
    const preview = await request.clone().json().catch(() => null);
    if (Array.isArray(preview?.participants)) {
      return jsonResponse({ error: 'Actualiza participantes mediante /participants para conservar atomicidad.' }, 400);
    }
  }

  return null;
}

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    const url = new URL(request.url);

    if (url.pathname === '/api/auth/token') return handleDiscordOAuthExchange(request, env);

    if (url.pathname.startsWith('/api/documents/')) {
      const result = await authorizeDocument(request, env, url);
      if (result.response) return result.response;
      return eventWorker.fetch(request, env, ctx);
    }

    if (url.pathname.startsWith('/api/activity-context/')) {
      const result = await authorizeActivityContext(request, env, url);
      if (result.response) return result.response;
      return eventWorker.fetch(request, env, ctx);
    }

    if (url.pathname.startsWith('/api/boards/')) {
      const result = await authorizeBoard(request, env, url);
      if (result.response) return result.response;

      if (request.method === 'GET' && !result.subroute) {
        const board = await loadBoardWithTasks(env.DB, result.boardId);
        if (!board) return jsonResponse({ error: 'Not found' }, 404);
        return jsonResponse({ ...board, guildId: board.guildId });
      }

      const mutation = await handleSecuredBoardMutation(request, env, result);
      if (mutation) return mutation;
      return eventWorker.fetch(request, env, ctx);
    }

    if (url.pathname.startsWith('/api/tasks/')) {
      const result = await authorizeTask(request, env, url);
      if (result.response) return result.response;
      return eventWorker.fetch(request, env, ctx);
    }

    if (url.pathname === '/api/events' || url.pathname.startsWith('/api/events/')) {
      const result = await authorizeEvents(request, env, url);
      if (result.response) return result.response;
      const integrityMutation = await handleSecuredEventIntegrityMutation(request, env, result);
      if (integrityMutation) return integrityMutation;
      return eventWorker.fetch(request, env, ctx);
    }

    if (url.pathname.startsWith('/api/')) return jsonResponse({ error: 'Not found' }, 404);
    return eventWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx = { waitUntil: () => {} }) {
    if (typeof eventWorker.scheduled === 'function') return eventWorker.scheduled(event, env, ctx);
  },
};
