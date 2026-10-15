// Acceso a D1 para Tareas (Kanban). Toda escritura va en un batch que sube
// `kanban_boards.rev` y marca las filas tocadas con ese rev (`board_rev`), así
// el poll de la Activity pide "cambios desde rev N" con una consulta indexada.
import {
  DEFAULT_KANBAN_COLUMNS,
  generateKeyBetween,
  rebalancedKeys,
  MAX_RANK_LENGTH,
} from '../activity-app/src/kanban/kanban-shared.js';

const REV = '(SELECT rev FROM kanban_boards WHERE id = ?)';

function parseJsonList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToBoard(row) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    rev: Number(row.rev) || 0,
    nextNumber: Number(row.next_number) || 1,
    updatedAt: row.updated_at,
  };
}

function rowToColumn(row) {
  return {id: row.id, name: row.name, position: Number(row.position), isDone: Boolean(row.is_done)};
}

function rowToTag(row) {
  return {id: row.id, name: row.name, color: row.color};
}

function rowToNotification(row) {
  return row ? {status: row.status, errorCode: row.error_code || null} : null;
}

export function rowToCard(row, notifications = null) {
  if (!row) return null;
  return {
    id: row.id,
    number: Number(row.number),
    columnId: row.column_id,
    rank: row.rank,
    title: row.title,
    description: row.description || '',
    assignee: row.assignee_id ? {id: row.assignee_id, name: row.assignee_name || 'Miembro'} : null,
    priority: row.priority,
    dueDate: row.due_date || null,
    tagIds: parseJsonList(row.tag_ids_json),
    subtasks: parseJsonList(row.subtasks_json),
    docIds: parseJsonList(row.doc_ids_json),
    sourceRef: row.source_ref || null,
    messageId: row.message_id || null,
    threadId: row.thread_id || null,
    threadPending: Boolean(row.thread_claimed_at && !row.thread_id),
    notifications: notifications || {channel: null, dm: null},
    version: Number(row.version),
    rev: Number(row.board_rev),
    completedAt: row.completed_at || null,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function bumpRev(db, boardId, userId, now) {
  return db.prepare('UPDATE kanban_boards SET rev = rev + 1, updated_at = ?, updated_by = ? WHERE id = ?')
    .bind(now, userId, boardId);
}

// ---------------------------------------------------------------------------
// Tablero

export async function loadKanbanBoard(db, guildId, channelId) {
  return rowToBoard(await db.prepare('SELECT * FROM kanban_boards WHERE guild_id = ? AND channel_id = ?')
    .bind(guildId, channelId).first());
}

/** Crea el tablero del canal con sus 3 columnas la primera vez (idempotente). */
export async function ensureKanbanBoard(db, guildId, channelId, userId) {
  const existing = await loadKanbanBoard(db, guildId, channelId);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements = [
    db.prepare(`INSERT INTO kanban_boards (id, guild_id, channel_id, rev, next_number, created_at, created_by, updated_at, updated_by)
      VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?) ON CONFLICT(guild_id, channel_id) DO NOTHING`)
      .bind(id, guildId, channelId, now, userId, now, userId),
    // Si otra petición ganó la carrera, el tablero `id` no existe y no se inserta nada.
    ...DEFAULT_KANBAN_COLUMNS.map((column, position) => db.prepare(
      `INSERT INTO kanban_columns (id, board_id, name, position, is_done, created_at, updated_at)
       SELECT ?, id, ?, ?, ?, ?, ? FROM kanban_boards WHERE id = ?`,
    ).bind(crypto.randomUUID(), column.name, position, column.isDone ? 1 : 0, now, now, id)),
  ];
  await db.batch(statements);
  return loadKanbanBoard(db, guildId, channelId);
}

export async function loadKanbanStructure(db, boardId) {
  const [columns, tags] = await Promise.all([
    db.prepare('SELECT * FROM kanban_columns WHERE board_id = ? ORDER BY position, id').bind(boardId).all(),
    db.prepare('SELECT * FROM kanban_tags WHERE board_id = ? ORDER BY name COLLATE NOCASE').bind(boardId).all(),
  ]);
  return {columns: columns.results.map(rowToColumn), tags: tags.results.map(rowToTag)};
}

// ---------------------------------------------------------------------------
// Tarjetas: lectura

async function notificationsByCard(db, boardId, sinceRev) {
  const query = sinceRev === null
    ? db.prepare(`SELECT n.* FROM kanban_notifications n JOIN kanban_cards c ON c.id = n.card_id
        WHERE c.board_id = ? AND c.archived_at IS NULL AND n.assignee_id = c.assignee_id`).bind(boardId)
    : db.prepare(`SELECT n.* FROM kanban_notifications n JOIN kanban_cards c ON c.id = n.card_id
        WHERE c.board_id = ? AND c.board_rev > ? AND n.assignee_id = c.assignee_id`).bind(boardId, sinceRev);
  const {results} = await query.all();
  const byCard = new Map();
  for (const row of results) {
    const entry = byCard.get(row.card_id) || {channel: null, dm: null};
    entry[row.kind] = rowToNotification(row);
    byCard.set(row.card_id, entry);
  }
  return byCard;
}

/**
 * Sin `sinceRev`: tarjetas activas. Con `sinceRev`: todo lo que cambió después,
 * incluidas las archivadas (la Activity las usa como "tombstones").
 */
export async function listKanbanCards(db, boardId, {sinceRev = null} = {}) {
  const query = sinceRev === null
    ? db.prepare('SELECT * FROM kanban_cards WHERE board_id = ? AND archived_at IS NULL ORDER BY column_id, rank, id').bind(boardId)
    : db.prepare('SELECT * FROM kanban_cards WHERE board_id = ? AND board_rev > ? ORDER BY column_id, rank, id').bind(boardId, sinceRev);
  const [{results}, notifications] = await Promise.all([query.all(), notificationsByCard(db, boardId, sinceRev)]);
  return results.map(row => rowToCard(row, notifications.get(row.id)));
}

export async function listArchivedKanbanCards(db, boardId, limit = 50) {
  const {results} = await db.prepare(
    'SELECT * FROM kanban_cards WHERE board_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT ?',
  ).bind(boardId, limit).all();
  return results.map(row => rowToCard(row));
}

export async function listKanbanCardsBySource(db, boardId, sourcePrefix) {
  const {results} = await db.prepare(
    'SELECT * FROM kanban_cards WHERE board_id = ? AND source_ref >= ? AND source_ref < ? ORDER BY number',
  ).bind(boardId, sourcePrefix, `${sourcePrefix}￿`).all();
  return results.map(row => rowToCard(row));
}

export async function loadKanbanCard(db, boardId, cardId) {
  const row = await db.prepare('SELECT * FROM kanban_cards WHERE id = ? AND board_id = ?').bind(cardId, boardId).first();
  if (!row) return null;
  const {results} = await db.prepare('SELECT * FROM kanban_notifications WHERE card_id = ? AND assignee_id = ?')
    .bind(cardId, row.assignee_id || '').all();
  const notifications = {channel: null, dm: null};
  for (const notification of results) notifications[notification.kind] = rowToNotification(notification);
  return rowToCard(row, notifications);
}

export async function loadKanbanCardOwner(db, cardId) {
  return db.prepare('SELECT board_id FROM kanban_cards WHERE id = ?').bind(cardId).first('board_id');
}

export async function countActiveKanbanCards(db, boardId) {
  return Number(await db.prepare('SELECT COUNT(*) AS n FROM kanban_cards WHERE board_id = ? AND archived_at IS NULL')
    .bind(boardId).first('n')) || 0;
}

async function columnRanks(db, boardId, columnId, excludeCardId = '') {
  const {results} = await db.prepare(
    'SELECT id, rank FROM kanban_cards WHERE board_id = ? AND column_id = ? AND archived_at IS NULL AND id != ? ORDER BY rank, id',
  ).bind(boardId, columnId, excludeCardId).all();
  return results;
}

/**
 * Rank para dejar una tarjeta entre `afterId` (arriba) y `beforeId` (abajo).
 * El servidor decide: si los vecinos ya no están en ese orden (otra persona
 * movió algo), cae a "justo debajo de `afterId`" o al final de la columna.
 */
export async function rankForPosition(db, boardId, columnId, {afterId = null, beforeId = null, excludeCardId = ''} = {}) {
  const cards = await columnRanks(db, boardId, columnId, excludeCardId);
  const indexOf = id => (id ? cards.findIndex(card => card.id === id) : -1);
  const afterIndex = indexOf(afterId);
  const beforeIndex = indexOf(beforeId);
  let upper;
  if (afterIndex !== -1) upper = afterIndex;
  else if (beforeIndex !== -1) upper = beforeIndex - 1;
  else if (afterId === null && beforeId !== null) upper = -1; // pidió el inicio
  else upper = cards.length - 1; // sin vecinos válidos: al final
  let lower = upper + 1;

  // Empates de rank (inserciones simultáneas): avanza hasta un vecino distinto.
  const upperRank = upper >= 0 ? cards[upper].rank : null;
  let lowerRank = lower < cards.length ? cards[lower].rank : null;
  while (lowerRank !== null && upperRank !== null && lowerRank <= upperRank) {
    lower += 1;
    lowerRank = lower < cards.length ? cards[lower].rank : null;
  }
  const rank = generateKeyBetween(upperRank, lowerRank);
  return {rank, needsRebalance: rank.length > MAX_RANK_LENGTH};
}

/** Reescribe los ranks de una columna con claves cortas equiespaciadas. */
export async function rebalanceKanbanColumn(db, boardId, columnId, userId) {
  const cards = await columnRanks(db, boardId, columnId);
  const keys = rebalancedKeys(cards.length);
  const now = new Date().toISOString();
  await db.batch([
    bumpRev(db, boardId, userId, now),
    ...cards.map((card, index) => db.prepare(`UPDATE kanban_cards SET rank = ?, board_rev = ${REV} WHERE id = ? AND board_id = ?`)
      .bind(keys[index], boardId, card.id, boardId)),
  ]);
}

// ---------------------------------------------------------------------------
// Tarjetas: escritura

/**
 * Inserta una tarjeta. Idempotente por `id` y por `sourceRef` dentro del
 * tablero: devuelve `{card, created:false}` si ya existía.
 */
export async function insertKanbanCard(db, board, card, userId) {
  const now = new Date().toISOString();
  const result = await db.batch([
    bumpRev(db, board.id, userId, now),
    db.prepare(`INSERT INTO kanban_cards (id, board_id, column_id, number, rank, title, description, assignee_id, assignee_name,
        priority, due_date, tag_ids_json, subtasks_json, doc_ids_json, source_ref, version, board_rev, completed_at,
        created_at, created_by, updated_at, updated_by)
      VALUES (?, ?, ?, (SELECT next_number FROM kanban_boards WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ${REV},
        CASE WHEN (SELECT is_done FROM kanban_columns WHERE id = ?) = 1 THEN ? ELSE NULL END, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING`).bind(
      card.id, board.id, card.columnId, board.id, card.rank, card.title, card.description || '',
      card.assignee?.id || null, card.assignee?.name || null, card.priority || 'normal', card.dueDate || null,
      JSON.stringify(card.tagIds || []), JSON.stringify(card.subtasks || []), JSON.stringify(card.docIds || []),
      card.sourceRef || null, board.id, card.columnId, now, now, userId, now, userId,
    ),
    db.prepare('UPDATE kanban_boards SET next_number = next_number + 1 WHERE id = ?').bind(board.id),
  ]);
  const created = Number(result[1]?.meta?.changes) === 1;
  if (created) return {card: await loadKanbanCard(db, board.id, card.id), created: true};

  const existing = card.sourceRef
    ? await db.prepare('SELECT id FROM kanban_cards WHERE board_id = ? AND source_ref = ?').bind(board.id, card.sourceRef).first('id')
    : null;
  return {card: await loadKanbanCard(db, board.id, existing || card.id), created: false};
}

const PATCH_COLUMNS = {
  title: 'title',
  description: 'description',
  priority: 'priority',
  dueDate: 'due_date',
  tagIds: 'tag_ids_json',
  subtasks: 'subtasks_json',
  docIds: 'doc_ids_json',
};

/**
 * Edita campos de contenido con concurrencia optimista sobre `version`.
 * Devuelve false si la versión ya no coincide (o la tarjeta fue archivada).
 */
export async function patchKanbanCard(db, boardId, cardId, fields, baseVersion, userId) {
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
    if (!(key in fields)) continue;
    sets.push(`${column} = ?`);
    const value = fields[key];
    values.push(Array.isArray(value) ? JSON.stringify(value) : value);
  }
  if ('assignee' in fields) {
    sets.push('assignee_id = ?', 'assignee_name = ?');
    values.push(fields.assignee?.id || null, fields.assignee?.name || null);
  }
  if (!sets.length) return true;

  const now = new Date().toISOString();
  const version = Number.isInteger(baseVersion) ? baseVersion : null;
  const guard = 'id = ? AND board_id = ? AND archived_at IS NULL AND (? IS NULL OR version = ?)';
  const result = await db.batch([
    db.prepare(`UPDATE kanban_boards SET rev = rev + 1, updated_at = ?, updated_by = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM kanban_cards WHERE ${guard})`)
      .bind(now, userId, boardId, cardId, boardId, version, version),
    db.prepare(`UPDATE kanban_cards SET ${sets.join(', ')}, version = version + 1, board_rev = ${REV},
      updated_at = ?, updated_by = ? WHERE ${guard}`)
      .bind(...values, boardId, now, userId, cardId, boardId, version, version),
  ]);
  return Number(result[1]?.meta?.changes) === 1;
}

/** Mover no toca `version`: mover y editar a la vez nunca chocan. */
export async function moveKanbanCard(db, boardId, cardId, columnId, rank, userId) {
  const now = new Date().toISOString();
  const result = await db.batch([
    bumpRev(db, boardId, userId, now),
    db.prepare(`UPDATE kanban_cards SET column_id = ?, rank = ?, board_rev = ${REV},
        completed_at = CASE WHEN (SELECT is_done FROM kanban_columns WHERE id = ?) = 1 THEN COALESCE(completed_at, ?) ELSE NULL END,
        updated_at = ?, updated_by = ?
      WHERE id = ? AND board_id = ? AND archived_at IS NULL`)
      .bind(columnId, rank, boardId, columnId, now, now, userId, cardId, boardId),
  ]);
  return Number(result[1]?.meta?.changes) === 1;
}

export async function setKanbanCardArchived(db, boardId, cardId, archived, userId) {
  const now = new Date().toISOString();
  const result = await db.batch([
    bumpRev(db, boardId, userId, now),
    db.prepare(`UPDATE kanban_cards SET archived_at = ?, archived_by = ?, board_rev = ${REV}, updated_at = ?, updated_by = ?
      WHERE id = ? AND board_id = ? AND ${archived ? 'archived_at IS NULL' : 'archived_at IS NOT NULL'}`)
      .bind(archived ? now : null, archived ? userId : null, boardId, now, userId, cardId, boardId),
  ]);
  return Number(result[1]?.meta?.changes) === 1;
}

export async function setKanbanCardMessageId(db, boardId, cardId, messageId) {
  await db.prepare('UPDATE kanban_cards SET message_id = COALESCE(message_id, ?) WHERE id = ? AND board_id = ?')
    .bind(messageId, cardId, boardId).run();
}

// ---------------------------------------------------------------------------
// Columnas

export async function addKanbanColumn(db, boardId, name, userId) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.batch([
    bumpRev(db, boardId, userId, now),
    db.prepare(`INSERT INTO kanban_columns (id, board_id, name, position, is_done, created_at, updated_at)
      VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM kanban_columns WHERE board_id = ?), 0, ?, ?)`)
      .bind(id, boardId, name, boardId, now, now),
  ]);
  return id;
}

export async function renameKanbanColumn(db, boardId, columnId, name, userId) {
  const now = new Date().toISOString();
  await db.batch([
    bumpRev(db, boardId, userId, now),
    db.prepare('UPDATE kanban_columns SET name = ?, updated_at = ? WHERE id = ? AND board_id = ?').bind(name, now, columnId, boardId),
  ]);
}

/** Marca otra columna como "Hecho" y recalcula `completed_at` de sus tarjetas. */
export async function setKanbanDoneColumn(db, boardId, columnId, userId) {
  const now = new Date().toISOString();
  await db.batch([
    bumpRev(db, boardId, userId, now),
    db.prepare('UPDATE kanban_columns SET is_done = 0, updated_at = ? WHERE board_id = ? AND is_done = 1').bind(now, boardId),
    db.prepare('UPDATE kanban_columns SET is_done = 1, updated_at = ? WHERE id = ? AND board_id = ?').bind(now, columnId, boardId),
    db.prepare(`UPDATE kanban_cards SET
        completed_at = CASE WHEN column_id = ? THEN COALESCE(completed_at, ?) ELSE NULL END, board_rev = ${REV}
      WHERE board_id = ? AND (column_id = ? OR completed_at IS NOT NULL)`)
      .bind(columnId, now, boardId, boardId, columnId),
  ]);
}

export async function reorderKanbanColumns(db, boardId, orderedIds, userId) {
  const now = new Date().toISOString();
  await db.batch([
    bumpRev(db, boardId, userId, now),
    ...orderedIds.map((id, position) => db.prepare('UPDATE kanban_columns SET position = ?, updated_at = ? WHERE id = ? AND board_id = ?')
      .bind(position, now, id, boardId)),
  ]);
}

/** Borra una columna moviendo antes todas sus tarjetas (también archivadas) a `moveToId`. */
export async function deleteKanbanColumn(db, boardId, columnId, moveToId, userId) {
  const now = new Date().toISOString();
  const statements = [bumpRev(db, boardId, userId, now)];
  if (moveToId) {
    const target = await columnRanks(db, boardId, moveToId);
    const {results: moving} = await db.prepare(
      'SELECT id FROM kanban_cards WHERE board_id = ? AND column_id = ? ORDER BY archived_at IS NOT NULL, rank, id',
    ).bind(boardId, columnId).all();
    const order = [...target.map(card => card.id), ...moving.map(card => card.id)];
    const keys = rebalancedKeys(order.length);
    for (const [index, id] of order.entries()) {
      statements.push(db.prepare(`UPDATE kanban_cards SET column_id = ?, rank = ?, board_rev = ${REV},
          completed_at = CASE WHEN (SELECT is_done FROM kanban_columns WHERE id = ?) = 1 THEN COALESCE(completed_at, ?) ELSE NULL END
        WHERE id = ? AND board_id = ?`).bind(moveToId, keys[index], boardId, moveToId, now, id, boardId));
    }
  }
  statements.push(db.prepare('DELETE FROM kanban_columns WHERE id = ? AND board_id = ?').bind(columnId, boardId));
  await db.batch(statements);
  const {columns} = await loadKanbanStructure(db, boardId);
  await reorderKanbanColumns(db, boardId, columns.map(column => column.id), userId);
}

export async function countKanbanCardsInColumn(db, boardId, columnId) {
  return Number(await db.prepare('SELECT COUNT(*) AS n FROM kanban_cards WHERE board_id = ? AND column_id = ?')
    .bind(boardId, columnId).first('n')) || 0;
}

// ---------------------------------------------------------------------------
// Etiquetas

export async function addKanbanTag(db, boardId, {name, color}, userId) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.batch([
    bumpRev(db, boardId, userId, now),
    db.prepare('INSERT INTO kanban_tags (id, board_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, boardId, name, color, now),
  ]);
  return id;
}

export async function updateKanbanTag(db, boardId, tagId, {name, color}, userId) {
  const now = new Date().toISOString();
  await db.batch([
    bumpRev(db, boardId, userId, now),
    db.prepare('UPDATE kanban_tags SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ? AND board_id = ?')
      .bind(name ?? null, color ?? null, tagId, boardId),
  ]);
}

export async function deleteKanbanTag(db, boardId, tagId, userId) {
  const now = new Date().toISOString();
  await db.batch([
    bumpRev(db, boardId, userId, now),
    db.prepare(`UPDATE kanban_cards SET
        tag_ids_json = (SELECT COALESCE(json_group_array(value), '[]') FROM json_each(kanban_cards.tag_ids_json) WHERE value != ?),
        board_rev = ${REV}
      WHERE board_id = ? AND EXISTS (SELECT 1 FROM json_each(kanban_cards.tag_ids_json) WHERE value = ?)`)
      .bind(tagId, boardId, boardId, tagId),
    db.prepare('DELETE FROM kanban_tags WHERE id = ? AND board_id = ?').bind(tagId, boardId),
  ]);
}

// ---------------------------------------------------------------------------
// Avisos (outbox) e hilos

/** true si esta petición es dueña del envío (nadie lo envió antes). */
export async function claimKanbanNotification(db, cardId, assigneeId, kind, {status = 'pending'} = {}) {
  const now = new Date().toISOString();
  const result = await db.prepare(`INSERT INTO kanban_notifications (card_id, assignee_id, kind, status, attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING`).bind(cardId, assigneeId, kind, status, now, now).run();
  return Number(result.meta?.changes) === 1;
}

/** Retoma un aviso fallido (o pendiente hace más de 2 minutos) para reintentarlo. */
export async function reclaimKanbanNotification(db, cardId, assigneeId, kind) {
  const now = new Date();
  const stale = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const result = await db.prepare(`UPDATE kanban_notifications SET status = 'pending', attempts = attempts + 1, updated_at = ?
    WHERE card_id = ? AND assignee_id = ? AND kind = ? AND (status = 'failed' OR (status = 'pending' AND updated_at < ?))`)
    .bind(now.toISOString(), cardId, assigneeId, kind, stale).run();
  return Number(result.meta?.changes) === 1;
}

export async function finishKanbanNotification(db, boardId, cardId, assigneeId, kind, {status, errorCode = null, messageId = null}) {
  const now = new Date().toISOString();
  const statements = [
    bumpRev(db, boardId, 'bardo', now),
    db.prepare(`UPDATE kanban_notifications SET status = ?, error_code = ?, message_id = ?, updated_at = ?
      WHERE card_id = ? AND assignee_id = ? AND kind = ?`)
      .bind(status, errorCode, messageId, now, cardId, assigneeId, kind),
    db.prepare(`UPDATE kanban_cards SET board_rev = ${REV} WHERE id = ? AND board_id = ?`).bind(boardId, cardId, boardId),
  ];
  if (kind === 'channel' && messageId) {
    statements.push(db.prepare('UPDATE kanban_cards SET message_id = ? WHERE id = ? AND board_id = ?').bind(messageId, cardId, boardId));
  }
  await db.batch(statements);
}

export async function claimKanbanThread(db, boardId, cardId) {
  const now = new Date();
  const stale = new Date(now.getTime() - 30 * 1000).toISOString();
  const result = await db.batch([
    bumpRev(db, boardId, 'bardo', now.toISOString()),
    db.prepare(`UPDATE kanban_cards SET thread_claimed_at = ?, board_rev = ${REV}
      WHERE id = ? AND board_id = ? AND thread_id IS NULL AND (thread_claimed_at IS NULL OR thread_claimed_at < ?)`)
      .bind(now.toISOString(), boardId, cardId, boardId, stale),
  ]);
  return Number(result[1]?.meta?.changes) === 1;
}

export async function finishKanbanThread(db, boardId, cardId, threadId) {
  const now = new Date().toISOString();
  await db.batch([
    bumpRev(db, boardId, 'bardo', now),
    db.prepare(`UPDATE kanban_cards SET thread_id = ?, thread_claimed_at = NULL, board_rev = ${REV} WHERE id = ? AND board_id = ?`)
      .bind(threadId, boardId, cardId, boardId),
  ]);
}

export async function releaseKanbanThreadClaim(db, boardId, cardId) {
  const now = new Date().toISOString();
  await db.batch([
    bumpRev(db, boardId, 'bardo', now),
    db.prepare(`UPDATE kanban_cards SET thread_claimed_at = NULL, board_rev = ${REV} WHERE id = ? AND board_id = ? AND thread_id IS NULL`)
      .bind(boardId, cardId, boardId),
  ]);
}
