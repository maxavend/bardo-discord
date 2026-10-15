// API de Tareas (Kanban): un tablero por canal. Misma autenticación y alcance
// que Reuniones (sesión de Bardo + permiso de ver el canal en Discord).
import {DISCORD_CLIENT_ID, requireDocsSession} from './discord-auth.js';
import {
  DISCORD_PERMISSION,
  canUserViewChannel,
  createDiscordPermissionChecker,
  discordUnavailableResponse,
  isDiscordUnavailableError,
} from './discord-permissions.js';
import {apiError, json} from './docs-api.js';
import {documentHasChannelAccess} from './db.js';
import {
  KANBAN_LIMITS,
  KANBAN_PRIORITIES,
  KANBAN_TAG_COLORS,
  generateKeyBetween,
  isIsoDate,
  normalizeIdList,
  normalizeSubtasks,
} from '../activity-app/src/kanban/kanban-shared.js';
import {
  addKanbanColumn,
  addKanbanTag,
  claimKanbanThread,
  countActiveKanbanCards,
  countKanbanCardsInColumn,
  deleteKanbanColumn,
  deleteKanbanTag,
  ensureKanbanBoard,
  finishKanbanThread,
  insertKanbanCard,
  listArchivedKanbanCards,
  listKanbanCards,
  listKanbanCardsBySource,
  loadKanbanBoard,
  loadKanbanCard,
  loadKanbanCardOwner,
  loadKanbanStructure,
  moveKanbanCard,
  patchKanbanCard,
  rankForPosition,
  rebalanceKanbanColumn,
  releaseKanbanThreadClaim,
  renameKanbanColumn,
  reorderKanbanColumns,
  setKanbanCardArchived,
  setKanbanDoneColumn,
  updateKanbanTag,
} from './kanban-db.js';
import {notifyAssignment, notifyBulkAssignment} from './kanban-notify.js';
import {
  createPublicThread,
  getChannel,
  postChannelMessage,
  startThreadFromMessage,
} from './discord-bot.js';
import {buildKanbanThreadStarterPayload, kanbanThreadName} from './components.js';

const PREFIX = '/api/kanban';
export const MAX_KANBAN_JSON_BYTES = 64 * 1024;
const encoder = new TextEncoder();
const THREAD_CHANNEL_TYPES = new Set([0, 5]);
const CARD_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const DISCORD_ID_PATTERN = /^\d{5,32}$/;

const methodNotAllowed = () => apiError(405, 'method_not_allowed', 'Esta acción no está disponible.');
const cardNotFound = () => apiError(404, 'not_found', 'Esta tarea ya no existe en este canal.');

export function parseKanbanRoute(pathname) {
  if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) return null;
  const parts = pathname.slice(PREFIX.length).split('/').filter(Boolean);
  let decoded;
  try {
    decoded = parts.map(part => decodeURIComponent(part));
  } catch {
    return {invalid: true};
  }
  const [resource, id, action, extra] = decoded;
  if (extra !== undefined) return {invalid: true};
  if (resource === 'board' && !id) return {resource};
  if (resource === 'cards') {
    if (!id) return {resource};
    if (id === 'bulk' && !action) return {resource, bulk: true};
    if (!action || ['move', 'archive', 'restore', 'thread', 'notify'].includes(action)) return {resource, id, action: action || null};
  }
  if (resource === 'columns') {
    if (!id) return {resource};
    if (id === 'reorder' && !action) return {resource, reorder: true};
    if (!action) return {resource, id};
  }
  if (resource === 'tags' && !action) return {resource, id: id || null};
  return {invalid: true};
}

async function readJsonBody(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    return {error: apiError(400, 'invalid_json', 'No se pudo leer el cuerpo de la solicitud.')};
  }
  if (encoder.encode(text).byteLength > MAX_KANBAN_JSON_BYTES) {
    return {error: apiError(413, 'too_large', 'La tarea supera el tamaño máximo permitido (64 KB).')};
  }
  if (!text.trim()) return {payload: {}};
  try {
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('not an object');
    return {payload};
  } catch {
    return {error: apiError(400, 'invalid_json', 'El cuerpo de la solicitud no es JSON válido.')};
  }
}

function actorFrom(session) {
  return {id: session.userId, name: String(session.username || '').trim() || 'Alguien'};
}

function boardPayload(board, structure) {
  return {
    id: board.id,
    rev: board.rev,
    guildId: board.guildId,
    channelId: board.channelId,
    columns: structure.columns,
    tags: structure.tags,
  };
}

async function freshBoardPayload(env, session) {
  const board = await loadKanbanBoard(env.DB, session.guildId, session.channelId);
  return boardPayload(board, await loadKanbanStructure(env.DB, board.id));
}

// ---------------------------------------------------------------------------
// Validación de campos

/**
 * Convierte el cuerpo en campos de tarjeta. `partial` (PATCH) solo incluye
 * los campos presentes. Devuelve {fields} o {error}.
 */
async function cardFieldsFromPayload(env, session, payload, structure, {partial}) {
  const fields = {};
  const has = key => Object.prototype.hasOwnProperty.call(payload, key);

  if (!partial || has('title')) {
    const title = String(payload.title ?? '').trim();
    if (!title) return {error: apiError(422, 'title_required', 'La tarea necesita un título.')};
    fields.title = title.slice(0, KANBAN_LIMITS.title);
  }
  if (has('description')) fields.description = String(payload.description ?? '').slice(0, KANBAN_LIMITS.description);
  if (has('priority')) {
    if (!KANBAN_PRIORITIES.includes(payload.priority)) return {error: apiError(422, 'invalid_priority', 'Prioridad no válida.')};
    fields.priority = payload.priority;
  }
  if (has('dueDate')) {
    const dueDate = payload.dueDate || null;
    if (dueDate !== null && !isIsoDate(dueDate)) return {error: apiError(422, 'invalid_date', 'La fecha límite debe tener el formato AAAA-MM-DD.')};
    fields.dueDate = dueDate;
  }
  if (has('tagIds')) {
    const tagIds = normalizeIdList(payload.tagIds, KANBAN_LIMITS.tags);
    if (tagIds === null || tagIds === false) return {error: apiError(422, 'invalid_tags', `Una tarea puede tener hasta ${KANBAN_LIMITS.tags} etiquetas.`)};
    const known = new Set(structure.tags.map(tag => tag.id));
    fields.tagIds = tagIds.filter(id => known.has(id));
  }
  if (has('subtasks')) {
    const subtasks = normalizeSubtasks(payload.subtasks);
    if (subtasks === null) return {error: apiError(422, 'invalid_subtasks', 'Las subtareas no son válidas.')};
    if (subtasks === false) return {error: apiError(422, 'subtask_limit', `Una tarea puede tener hasta ${KANBAN_LIMITS.subtasks} subtareas.`)};
    fields.subtasks = subtasks;
  }
  if (has('docIds')) {
    const docIds = normalizeIdList(payload.docIds, KANBAN_LIMITS.docs);
    if (docIds === null) return {error: apiError(422, 'invalid_docs', 'Los documentos no son válidos.')};
    if (docIds === false) return {error: apiError(422, 'doc_limit', `Puedes enlazar hasta ${KANBAN_LIMITS.docs} documentos.`)};
    for (const docId of docIds) {
      if (!(await documentHasChannelAccess(env.DB, docId, session.guildId, session.channelId))) {
        return {error: apiError(422, 'doc_not_in_channel', 'Ese documento no está compartido en este canal.')};
      }
    }
    fields.docIds = docIds;
  }
  if (has('assigneeId')) {
    const assigneeId = payload.assigneeId ? String(payload.assigneeId).trim() : '';
    if (!assigneeId) {
      fields.assignee = null;
    } else {
      if (!DISCORD_ID_PATTERN.test(assigneeId)) return {error: apiError(422, 'invalid_assignee', 'Elige a un miembro del servidor.')};
      const name = String(payload.assigneeName ?? '').trim().slice(0, KANBAN_LIMITS.assigneeName) || 'Miembro';
      fields.assignee = {id: assigneeId, name};
    }
  }
  return {fields};
}

/** Quien recibe una tarea debe poder ver el canal: el MD no puede filtrar tareas privadas. */
async function assigneeAccessError(env, session, assignee) {
  if (!assignee || String(assignee.id) === String(session.userId)) return null;
  const canView = await createDiscordPermissionChecker(env, session.guildId, assignee.id).canViewChannel(session.channelId);
  return canView ? null : apiError(422, 'assignee_no_access', 'Esa persona no puede ver este canal.');
}

function defaultColumnId(structure) {
  return (structure.columns.find(column => !column.isDone) || structure.columns[0])?.id || null;
}

function columnName(structure, columnId) {
  return structure.columns.find(column => column.id === columnId)?.name || null;
}

// ---------------------------------------------------------------------------
// Capacidades del bot en el canal (hilos y avisos)

const PERMISSION_NAMES = {
  VIEW_CHANNEL: 'Ver canal',
  SEND_MESSAGES: 'Enviar mensajes',
  CREATE_PUBLIC_THREADS: 'Crear hilos públicos',
  SEND_MESSAGES_IN_THREADS: 'Enviar mensajes en hilos',
};

async function botChannelState(env, session) {
  const channel = await getChannel(env, session.channelId);
  const channelType = channel.ok ? Number(channel.data?.type ?? 0) : null;
  let permissions = 0n;
  try {
    const botUserId = env.DISCORD_APPLICATION_ID || DISCORD_CLIENT_ID;
    permissions = await createDiscordPermissionChecker(env, session.guildId, botUserId).computeChannelPermissions(session.channelId);
  } catch (error) {
    if (isDiscordUnavailableError(error)) throw error;
  }
  const missing = name => (permissions & DISCORD_PERMISSION[name]) !== DISCORD_PERMISSION[name];
  const threadPermissions = ['VIEW_CHANNEL', 'SEND_MESSAGES', 'CREATE_PUBLIC_THREADS', 'SEND_MESSAGES_IN_THREADS'];
  return {
    channelType,
    threadsSupported: channelType !== null && THREAD_CHANNEL_TYPES.has(channelType),
    canPostMessages: !missing('VIEW_CHANNEL') && !missing('SEND_MESSAGES'),
    missingThreadPermissions: threadPermissions.filter(missing).map(name => PERMISSION_NAMES[name]),
  };
}

async function capabilities(env, session) {
  try {
    const state = await botChannelState(env, session);
    return {
      threadsSupported: state.threadsSupported,
      canCreateThreads: state.threadsSupported && state.missingThreadPermissions.length === 0,
      canPostMessages: state.canPostMessages,
      missingPermissions: state.missingThreadPermissions,
    };
  } catch {
    return {threadsSupported: false, canCreateThreads: false, canPostMessages: false, missingPermissions: [], unknown: true};
  }
}

// ---------------------------------------------------------------------------
// Handlers

async function handleBoard(request, url, env, session) {
  if (request.method !== 'GET') return methodNotAllowed();
  const board = await ensureKanbanBoard(env.DB, session.guildId, session.channelId, session.userId);
  const sinceParam = url.searchParams.get('since');
  const since = sinceParam !== null && /^\d+$/.test(sinceParam) ? Number(sinceParam) : null;
  const wantsCapabilities = url.searchParams.get('capabilities') === '1';

  if (since !== null && since === board.rev && !wantsCapabilities) return json({unchanged: true, rev: board.rev});

  const full = since === null || since > board.rev;
  const [structure, cards] = await Promise.all([
    loadKanbanStructure(env.DB, board.id),
    listKanbanCards(env.DB, board.id, {sinceRev: full ? null : since}),
  ]);
  return json({
    board: boardPayload(board, structure),
    cards,
    full,
    ...(wantsCapabilities ? {capabilities: await capabilities(env, session)} : {}),
  });
}

async function createCard(request, env, ctx, session, board, structure) {
  const body = await readJsonBody(request);
  if (body.error) return body.error;
  const payload = body.payload;

  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : crypto.randomUUID();
  if (!CARD_ID_PATTERN.test(id)) return apiError(422, 'invalid_id', 'Identificador de tarea inválido.');
  const owner = await loadKanbanCardOwner(env.DB, id);
  if (owner && owner !== board.id) return apiError(409, 'exists', 'Ya existe una tarea con ese identificador en otro canal.');
  if (owner) return json({card: await loadKanbanCard(env.DB, board.id, id)});

  if (await countActiveKanbanCards(env.DB, board.id) >= KANBAN_LIMITS.activeCards) {
    return apiError(422, 'board_full', `El tablero llegó a ${KANBAN_LIMITS.activeCards} tareas activas. Archiva algunas para seguir.`);
  }

  const parsed = await cardFieldsFromPayload(env, session, payload, structure, {partial: false});
  if (parsed.error) return parsed.error;
  const accessError = await assigneeAccessError(env, session, parsed.fields.assignee);
  if (accessError) return accessError;

  const columnId = payload.columnId && structure.columns.some(column => column.id === payload.columnId)
    ? payload.columnId
    : defaultColumnId(structure);
  const {rank} = await rankForPosition(env.DB, board.id, columnId, {
    afterId: payload.afterId || null,
    beforeId: payload.beforeId || null,
  });

  const {card, created} = await insertKanbanCard(env.DB, board, {...parsed.fields, id, columnId, rank}, session.userId);
  if (created && card.assignee) {
    ctx.waitUntil(notifyAssignment(env, {board, card, actor: actorFrom(session), columnName: columnName(structure, columnId)}));
  }
  return json({card}, created ? 201 : 200);
}

async function createCardsBulk(request, env, ctx, session, board, structure) {
  if (request.method !== 'POST') return methodNotAllowed();
  const body = await readJsonBody(request);
  if (body.error) return body.error;
  const {source, cards: items} = body.payload;
  const sessionId = source?.type === 'planner' ? String(source.sessionId || '').trim().slice(0, 128) : '';
  if (!sessionId) return apiError(422, 'invalid_source', 'Indica la reunión de origen.');
  if (!Array.isArray(items) || !items.length) return apiError(422, 'no_cards', 'Elige al menos un acuerdo.');
  if (items.length > 30) return apiError(422, 'too_many_cards', 'Puedes crear hasta 30 tareas a la vez.');
  if (await countActiveKanbanCards(env.DB, board.id) + items.length > KANBAN_LIMITS.activeCards) {
    return apiError(422, 'board_full', `El tablero llegó a ${KANBAN_LIMITS.activeCards} tareas activas. Archiva algunas para seguir.`);
  }

  const prefix = `planner:${sessionId}:`;
  const columnId = body.payload.columnId && structure.columns.some(column => column.id === body.payload.columnId)
    ? body.payload.columnId
    : defaultColumnId(structure);

  const prepared = [];
  const checkedAssignees = new Set();
  for (const item of items) {
    const sourceRef = String(item?.sourceRef || '');
    if (!sourceRef.startsWith(prefix) || sourceRef.length > 300) return apiError(422, 'invalid_source', 'Acuerdo de origen inválido.');
    const parsed = await cardFieldsFromPayload(env, session, item, structure, {partial: false});
    if (parsed.error) return parsed.error;
    const assignee = parsed.fields.assignee;
    if (assignee && !checkedAssignees.has(assignee.id)) {
      const accessError = await assigneeAccessError(env, session, assignee);
      if (accessError) return accessError;
      checkedAssignees.add(assignee.id);
    }
    prepared.push({...parsed.fields, sourceRef});
  }

  let {rank} = await rankForPosition(env.DB, board.id, columnId);
  const created = [];
  const existing = [];
  for (const fields of prepared) {
    const result = await insertKanbanCard(env.DB, board, {...fields, id: crypto.randomUUID(), columnId, rank}, session.userId);
    (result.created ? created : existing).push(result.card);
    if (result.created) rank = generateKeyBetween(rank, null);
  }
  if (created.length) {
    const sessionTitle = String(body.payload.sessionTitle || '').trim().slice(0, 200) || null;
    ctx.waitUntil(notifyBulkAssignment(env, {board, cards: created, actor: actorFrom(session), sessionTitle}));
  }
  return json({created, existing}, created.length ? 201 : 200);
}

async function patchCard(request, env, ctx, session, board, structure, card) {
  const body = await readJsonBody(request);
  if (body.error) return body.error;
  const payload = body.payload;
  if (card.archivedAt) return apiError(410, 'archived', 'Esta tarea fue archivada.', {card});

  const baseVersion = Number.isInteger(payload.baseVersion) ? payload.baseVersion : null;
  if (baseVersion !== null && baseVersion !== card.version) {
    return apiError(409, 'conflict', 'Otra persona cambió esta tarea.', {card});
  }
  const parsed = await cardFieldsFromPayload(env, session, payload, structure, {partial: true});
  if (parsed.error) return parsed.error;
  const fields = parsed.fields;
  const assigneeChanged = 'assignee' in fields && (fields.assignee?.id || null) !== (card.assignee?.id || null);
  if (assigneeChanged) {
    const accessError = await assigneeAccessError(env, session, fields.assignee);
    if (accessError) return accessError;
  }

  const written = await patchKanbanCard(env.DB, board.id, card.id, fields, baseVersion ?? card.version, session.userId);
  const refreshed = await loadKanbanCard(env.DB, board.id, card.id);
  if (!written) {
    if (!refreshed) return cardNotFound();
    if (refreshed.archivedAt) return apiError(410, 'archived', 'Esta tarea fue archivada.', {card: refreshed});
    return apiError(409, 'conflict', 'Otra persona cambió esta tarea.', {card: refreshed});
  }
  if (assigneeChanged && refreshed.assignee) {
    ctx.waitUntil(notifyAssignment(env, {board, card: refreshed, actor: actorFrom(session), columnName: columnName(structure, refreshed.columnId)}));
  }
  return json({card: refreshed});
}

async function moveCard(request, env, session, board, structure, card) {
  if (request.method !== 'POST') return methodNotAllowed();
  const body = await readJsonBody(request);
  if (body.error) return body.error;
  if (card.archivedAt) return apiError(410, 'archived', 'Esta tarea fue archivada.', {card});
  const {columnId, afterId = null, beforeId = null} = body.payload;
  if (!structure.columns.some(column => column.id === columnId)) {
    return apiError(404, 'column_not_found', 'Esa columna ya no existe.', {card});
  }
  const {rank, needsRebalance} = await rankForPosition(env.DB, board.id, columnId, {afterId, beforeId, excludeCardId: card.id});
  const moved = await moveKanbanCard(env.DB, board.id, card.id, columnId, rank, session.userId);
  if (!moved) {
    const refreshed = await loadKanbanCard(env.DB, board.id, card.id);
    return refreshed ? apiError(410, 'archived', 'Esta tarea fue archivada.', {card: refreshed}) : cardNotFound();
  }
  if (needsRebalance) await rebalanceKanbanColumn(env.DB, board.id, columnId, session.userId);
  return json({card: await loadKanbanCard(env.DB, board.id, card.id)});
}

async function archiveCard(request, env, session, board, card, archived) {
  if (request.method !== 'POST') return methodNotAllowed();
  if (!archived && card.archivedAt
    && await countActiveKanbanCards(env.DB, board.id) >= KANBAN_LIMITS.activeCards) {
    return apiError(422, 'board_full', `El tablero llegó a ${KANBAN_LIMITS.activeCards} tareas activas. Archiva algunas para seguir.`);
  }
  await setKanbanCardArchived(env.DB, board.id, card.id, archived, session.userId);
  return json({card: await loadKanbanCard(env.DB, board.id, card.id)});
}

async function openThread(request, env, ctx, session, board, card) {
  if (request.method !== 'POST') return methodNotAllowed();
  if (card.threadId) return json({card});
  if (card.archivedAt) return apiError(410, 'archived', 'Esta tarea fue archivada.', {card});

  const state = await botChannelState(env, session);
  if (!state.threadsSupported) {
    return apiError(409, 'threads_unsupported', 'Los hilos solo se pueden abrir en canales de texto, no en canales de voz ni dentro de otro hilo.');
  }
  if (state.missingThreadPermissions.length) {
    return apiError(403, 'bot_missing_permissions',
      `Bardo necesita estos permisos en el canal: ${state.missingThreadPermissions.join(', ')}.`,
      {missing: state.missingThreadPermissions});
  }

  if (!(await claimKanbanThread(env.DB, board.id, card.id))) {
    return json({card: await loadKanbanCard(env.DB, board.id, card.id)}, 202);
  }

  const name = kanbanThreadName(card);
  let result = card.messageId ? await startThreadFromMessage(env, board.channelId, card.messageId, name) : null;
  // El mensaje original pudo borrarse o ya tener un hilo: crea uno independiente.
  if (!result || (!result.ok && result.status !== 429 && result.code !== 'missing_permissions')) {
    result = await createPublicThread(env, board.channelId, name);
  }
  if (!result.ok) {
    await releaseKanbanThreadClaim(env.DB, board.id, card.id);
    if (result.code === 'rate_limited' || result.code === 'discord_unavailable') {
      return apiError(503, 'discord_unavailable', 'Discord no pudo crear el hilo ahora. Inténtalo en unos segundos.',
        {retryAfterMs: result.retryAfterMs || 2000});
    }
    if (result.code === 'missing_permissions') {
      return apiError(403, 'bot_missing_permissions', 'Bardo no tiene permiso para crear hilos en este canal.', {missing: []});
    }
    return apiError(502, 'thread_failed', 'Bardo no pudo crear el hilo de esta tarea.');
  }

  const threadId = result.data?.id;
  await finishKanbanThread(env.DB, board.id, card.id, threadId);
  // Mencionar suma a quien recibe la tarea y a quien abrió el hilo.
  ctx.waitUntil(postChannelMessage(env, threadId, buildKanbanThreadStarterPayload({card, actorId: session.userId}))
    .catch(error => console.error('Kanban thread starter failed', error)));
  return json({card: await loadKanbanCard(env.DB, board.id, card.id)});
}

async function retryNotice(request, env, ctx, session, board, structure, card) {
  if (request.method !== 'POST') return methodNotAllowed();
  if (!card.assignee) return apiError(422, 'no_assignee', 'Esta tarea no tiene responsable.');
  ctx.waitUntil(notifyAssignment(env, {
    board, card, actor: actorFrom(session), columnName: columnName(structure, card.columnId), retry: true,
  }));
  return json({card}, 202);
}

async function handleCards(route, request, url, env, ctx, session) {
  const board = await ensureKanbanBoard(env.DB, session.guildId, session.channelId, session.userId);
  const structure = await loadKanbanStructure(env.DB, board.id);

  if (route.bulk) return createCardsBulk(request, env, ctx, session, board, structure);

  if (!route.id) {
    if (request.method === 'POST') return createCard(request, env, ctx, session, board, structure);
    if (request.method !== 'GET') return methodNotAllowed();
    const source = url.searchParams.get('source');
    if (source) {
      if (!/^planner:[^:]{1,128}$/.test(source)) return apiError(400, 'invalid_source', 'Origen inválido.');
      return json({cards: await listKanbanCardsBySource(env.DB, board.id, `${source}:`)});
    }
    if (url.searchParams.get('archived') === '1') return json({cards: await listArchivedKanbanCards(env.DB, board.id)});
    return json({cards: await listKanbanCards(env.DB, board.id)});
  }

  const card = await loadKanbanCard(env.DB, board.id, route.id);
  if (!card) return cardNotFound();

  switch (route.action) {
    case null:
      if (request.method === 'GET') return json({card});
      if (request.method === 'PATCH') return patchCard(request, env, ctx, session, board, structure, card);
      return methodNotAllowed();
    case 'move': return moveCard(request, env, session, board, structure, card);
    case 'archive': return archiveCard(request, env, session, board, card, true);
    case 'restore': return archiveCard(request, env, session, board, card, false);
    case 'thread': return openThread(request, env, ctx, session, board, card);
    case 'notify': return retryNotice(request, env, ctx, session, board, structure, card);
    default: return methodNotAllowed();
  }
}

/** Id propuesto por la Activity (UI optimista): null si no vino, false si es inválido. */
function clientId(value) {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' && CARD_ID_PATTERN.test(value) ? value : false;
}

function cleanColumnName(value) {
  const name = String(value ?? '').trim().slice(0, KANBAN_LIMITS.columnName);
  return name || null;
}

async function handleColumns(route, request, url, env, session) {
  const board = await ensureKanbanBoard(env.DB, session.guildId, session.channelId, session.userId);
  const {columns} = await loadKanbanStructure(env.DB, board.id);

  if (route.reorder) {
    if (request.method !== 'POST') return methodNotAllowed();
    const body = await readJsonBody(request);
    if (body.error) return body.error;
    const order = Array.isArray(body.payload.order) ? body.payload.order.map(String) : [];
    const known = columns.map(column => column.id);
    if (order.length !== known.length || new Set(order).size !== order.length || !order.every(id => known.includes(id))) {
      return apiError(409, 'columns_changed', 'Las columnas cambiaron. Vuelve a intentarlo.', {board: await freshBoardPayload(env, session)});
    }
    await reorderKanbanColumns(env.DB, board.id, order, session.userId);
    return json({board: await freshBoardPayload(env, session)});
  }

  if (!route.id) {
    if (request.method !== 'POST') return methodNotAllowed();
    if (columns.length >= KANBAN_LIMITS.columns) {
      return apiError(422, 'column_limit', `El tablero puede tener hasta ${KANBAN_LIMITS.columns} columnas.`);
    }
    const body = await readJsonBody(request);
    if (body.error) return body.error;
    const name = cleanColumnName(body.payload.name);
    if (!name) return apiError(422, 'name_required', 'La columna necesita un nombre.');
    const requestedId = clientId(body.payload.id);
    if (requestedId === false) return apiError(422, 'invalid_id', 'Identificador de columna inválido.');
    if (requestedId && columns.some(column => column.id === requestedId)) {
      return json({board: await freshBoardPayload(env, session), columnId: requestedId});
    }
    let id;
    try {
      id = await addKanbanColumn(env.DB, board.id, name, session.userId, requestedId || undefined);
    } catch (error) {
      if (isUniqueError(error)) return apiError(409, 'exists', 'Ese identificador ya está en uso.');
      throw error;
    }
    return json({board: await freshBoardPayload(env, session), columnId: id}, 201);
  }

  const column = columns.find(item => item.id === route.id);
  if (!column) return apiError(404, 'column_not_found', 'Esa columna ya no existe.', {board: await freshBoardPayload(env, session)});

  if (request.method === 'PATCH') {
    const body = await readJsonBody(request);
    if (body.error) return body.error;
    const {payload} = body;
    if ('name' in payload) {
      const name = cleanColumnName(payload.name);
      if (!name) return apiError(422, 'name_required', 'La columna necesita un nombre.');
      await renameKanbanColumn(env.DB, board.id, column.id, name, session.userId);
    }
    if (payload.isDone === true && !column.isDone) await setKanbanDoneColumn(env.DB, board.id, column.id, session.userId);
    if (payload.isDone === false && column.isDone) {
      return apiError(422, 'done_required', 'Siempre hay una columna "Hecho". Marca otra como "Hecho" en su lugar.');
    }
    return json({board: await freshBoardPayload(env, session)});
  }

  if (request.method === 'DELETE') {
    if (column.isDone) return apiError(422, 'done_required', 'No puedes eliminar la columna "Hecho". Marca otra como "Hecho" primero.');
    if (columns.length <= 1) return apiError(422, 'last_column', 'El tablero necesita al menos una columna.');
    const moveTo = url.searchParams.get('moveTo');
    const hasCards = await countKanbanCardsInColumn(env.DB, board.id, column.id) > 0;
    const target = columns.find(item => item.id === moveTo && item.id !== column.id);
    if (hasCards && !target) return apiError(422, 'move_target_required', 'Elige a qué columna mover sus tareas.');
    await deleteKanbanColumn(env.DB, board.id, column.id, hasCards ? target.id : null, session.userId);
    return json({board: await freshBoardPayload(env, session)});
  }

  return methodNotAllowed();
}

function cleanTag(payload, {partial}) {
  const tag = {};
  if (!partial || 'name' in payload) {
    const name = String(payload.name ?? '').trim().slice(0, KANBAN_LIMITS.tagName);
    if (!name) return {error: apiError(422, 'name_required', 'La etiqueta necesita un nombre.')};
    tag.name = name;
  }
  if (!partial || 'color' in payload) {
    const color = payload.color ?? 'gray';
    if (!KANBAN_TAG_COLORS.includes(color)) return {error: apiError(422, 'invalid_color', 'Color de etiqueta no válido.')};
    tag.color = color;
  }
  return {tag};
}

function isUniqueError(error) {
  return /UNIQUE constraint failed/i.test(String(error?.message || error));
}

async function handleTags(route, request, env, session) {
  const board = await ensureKanbanBoard(env.DB, session.guildId, session.channelId, session.userId);
  const {tags} = await loadKanbanStructure(env.DB, board.id);
  const duplicate = () => apiError(409, 'tag_exists', 'Ya existe una etiqueta con ese nombre.');

  if (!route.id) {
    if (request.method !== 'POST') return methodNotAllowed();
    if (tags.length >= KANBAN_LIMITS.tags) return apiError(422, 'tag_limit', `El tablero puede tener hasta ${KANBAN_LIMITS.tags} etiquetas.`);
    const body = await readJsonBody(request);
    if (body.error) return body.error;
    const parsed = cleanTag(body.payload, {partial: false});
    if (parsed.error) return parsed.error;
    const requestedId = clientId(body.payload.id);
    if (requestedId === false) return apiError(422, 'invalid_id', 'Identificador de etiqueta inválido.');
    if (requestedId && tags.some(tag => tag.id === requestedId)) {
      return json({board: await freshBoardPayload(env, session), tagId: requestedId});
    }
    try {
      const id = await addKanbanTag(env.DB, board.id, parsed.tag, session.userId, requestedId || undefined);
      return json({board: await freshBoardPayload(env, session), tagId: id}, 201);
    } catch (error) {
      if (isUniqueError(error)) return duplicate();
      throw error;
    }
  }

  if (!tags.some(tag => tag.id === route.id)) return apiError(404, 'tag_not_found', 'Esa etiqueta ya no existe.');
  if (request.method === 'PATCH') {
    const body = await readJsonBody(request);
    if (body.error) return body.error;
    const parsed = cleanTag(body.payload, {partial: true});
    if (parsed.error) return parsed.error;
    try {
      await updateKanbanTag(env.DB, board.id, route.id, parsed.tag, session.userId);
    } catch (error) {
      if (isUniqueError(error)) return duplicate();
      throw error;
    }
    return json({board: await freshBoardPayload(env, session)});
  }
  if (request.method === 'DELETE') {
    await deleteKanbanTag(env.DB, board.id, route.id, session.userId);
    return json({board: await freshBoardPayload(env, session)});
  }
  return methodNotAllowed();
}

async function routeKanbanApi(request, url, env, ctx) {
  const route = parseKanbanRoute(url.pathname);
  if (!route) return null;
  if (route.invalid) return apiError(404, 'invalid_route', 'Esta dirección de Tareas no existe.');

  const auth = await requireDocsSession(request, env);
  if (auth.error) return auth.error;
  const {session} = auth;
  if (!session.guildId || !session.channelId) return apiError(403, 'channel_required', 'Abre Bardo desde un canal de Discord.');
  if (!(await canUserViewChannel(env, session.guildId, session.userId, session.channelId))) {
    return apiError(403, 'forbidden', 'No tienes permiso para acceder a este canal de Discord.');
  }

  if (route.resource === 'board') return handleBoard(request, url, env, session);
  if (route.resource === 'cards') return handleCards(route, request, url, env, ctx, session);
  if (route.resource === 'columns') return handleColumns(route, request, url, env, session);
  return handleTags(route, request, env, session);
}

export async function handleKanbanApi(request, url, env, ctx = {waitUntil: () => {}}) {
  try {
    return await routeKanbanApi(request, url, env, ctx);
  } catch (error) {
    if (isDiscordUnavailableError(error)) return discordUnavailableResponse(error);
    throw error;
  }
}
