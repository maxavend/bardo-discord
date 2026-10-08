function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;

  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }

  if (Array.isArray(value)) {
    return Uint8Array.from(value).buffer;
  }

  throw new TypeError('Bardo esperaba bytes binarios compatibles con ArrayBuffer.');
}

function parsePages(value) {
  try {
    const pages = JSON.parse(value || '[]');
    return Array.isArray(pages) ? pages : [];
  } catch {
    return [];
  }
}

function mapDocumentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    originalMarkdown: row.original_markdown || '',
    pages: parsePages(row.pages),
    sourceName: row.source_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    archivedAt: row.archived_at || null,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    updatedBy: row.updated_by || null,
    updatedByName: row.updated_by_name || null,
    sourceMime: row.source_mime || null,
    sourceType: row.source_type || 'markdown',
    importStatus: row.import_status || 'ready',
    hasSource: Boolean(row.has_source),
  };
}

// D1 rejects rows above ~2 MB. Keep the original upload only while the row
// (source blob + normalized markdown) stays comfortably below that limit.
export const MAX_ROW_PAYLOAD_BYTES = 1_900_000;

// Every document read goes through these columns. `source_blob` is never
// selected or grouped (it can be 1.8 MB); only its presence is exposed.
const DOCUMENT_COLUMNS = `d.id, d.title, d.description, d.original_markdown, d.pages, d.source_name,
       d.created_at, d.updated_at, d.archived_at, d.created_by, d.created_by_name,
       d.updated_by, d.updated_by_name, d.source_mime, d.source_type, d.import_status,
       CASE WHEN d.source_blob IS NULL THEN 0 ELSE 1 END AS has_source`;

// Same row shape without the (potentially large) body, for `?summary=1`.
const DOCUMENT_SUMMARY_COLUMNS = `d.id, d.title, d.description, '' AS original_markdown, '[]' AS pages, d.source_name,
       d.created_at, d.updated_at, d.archived_at, d.created_by, d.created_by_name,
       d.updated_by, d.updated_by_name, d.source_mime, d.source_type, d.import_status,
       CASE WHEN d.source_blob IS NULL THEN 0 ELSE 1 END AS has_source`;

function documentBindings(messageId, document) {
  return [
    messageId,
    document.title,
    document.description || '',
    document.originalMarkdown || '',
    JSON.stringify(document.pages || []),
    document.sourceName || null,
    document.createdAt,
    document.createdBy,
    document.createdByName || null,
    document.updatedAt || document.createdAt,
    document.updatedBy || document.createdBy || null,
    document.updatedByName || document.createdByName || null,
  ];
}

/**
 * Plain INSERT (no upsert) so a duplicate id fails with a constraint error
 * instead of silently overwriting another document. An optional `source`
 * stores the original PDF/DOCX in the same statement, so an import can never
 * leave a "ready" placeholder without its file.
 */
export function insertDocumentStatement(db, messageId, document, source = null) {
  const buffer = source?.bytes ? toArrayBuffer(source.bytes) : null;
  return db
    .prepare(
      `INSERT INTO documents (
         id, title, description, original_markdown, pages, source_name, created_at, created_by,
         created_by_name, updated_at, updated_by, updated_by_name,
         source_blob, source_mime, source_type, import_status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      ...documentBindings(messageId, document),
      buffer,
      buffer ? (source.mime || 'application/octet-stream') : null,
      source?.type || document.sourceType || 'markdown',
      buffer ? 'pending' : 'ready',
    );
}

export function isUniqueConstraintError(error) {
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT_PRIMARYKEY|PRIMARY KEY must be unique/i
    .test(String(error?.message || error));
}

export async function saveDocument(db, messageId, document) {
  await db
    .prepare(
      `INSERT INTO documents (
         id, title, description, original_markdown, pages, source_name, created_at, created_by,
         created_by_name, updated_at, updated_by, updated_by_name
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         original_markdown = excluded.original_markdown,
         pages = excluded.pages,
         source_name = excluded.source_name,
         created_at = COALESCE(documents.created_at, excluded.created_at),
         created_by = COALESCE(documents.created_by, excluded.created_by),
         created_by_name = COALESCE(documents.created_by_name, excluded.created_by_name),
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         updated_by_name = excluded.updated_by_name`,
    )
    .bind(...documentBindings(messageId, document))
    .run();
}

export async function saveDocumentSource(db, documentId, source) {
  const buffer = toArrayBuffer(source.bytes);

  await db
    .prepare(
      `UPDATE documents
       SET source_blob = ?, source_mime = ?, source_type = ?, import_status = 'pending'
       WHERE id = ?`,
    )
    .bind(buffer, source.mime || 'application/octet-stream', source.type, documentId)
    .run();
}

export async function loadDocument(db, messageId) {
  const row = await db
    .prepare(`SELECT ${DOCUMENT_COLUMNS} FROM documents d WHERE d.id = ?`)
    .bind(messageId)
    .first();

  return mapDocumentRow(row);
}

export async function documentExists(db, documentId) {
  const row = await db
    .prepare('SELECT 1 AS found FROM documents WHERE id = ? LIMIT 1')
    .bind(documentId)
    .first();
  return Boolean(row?.found);
}

/**
 * Documents shared with one Discord channel. The channel ACL is applied in SQL
 * before LIMIT, so documents of other channels can neither crowd out nor leak
 * into this channel's library. `source_blob` is never selected nor grouped.
 */
export async function listDocumentsForChannel(
  db,
  guildId,
  channelId,
  {archived = false, limit = 150, summary = false} = {},
) {
  if (!guildId || !channelId) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 150, 250));
  const columns = summary ? DOCUMENT_SUMMARY_COLUMNS : DOCUMENT_COLUMNS;
  const archivedFilter = archived ? 'd.archived_at IS NOT NULL' : 'd.archived_at IS NULL';
  const order = archived
    ? "COALESCE(d.archived_at, NULLIF(d.updated_at, ''), d.created_at) DESC"
    : "COALESCE(NULLIF(d.updated_at, ''), d.created_at) DESC";
  const result = await db
    .prepare(
      `SELECT ${columns},
              (SELECT GROUP_CONCAT(c.channel_id)
                 FROM document_channel_access c
                WHERE c.document_id = d.id AND c.guild_id = ?) AS access_channel_ids
       FROM documents d
       WHERE ${archivedFilter}
         AND EXISTS (
           SELECT 1 FROM document_channel_access a
            WHERE a.document_id = d.id AND a.guild_id = ? AND a.channel_id = ?
         )
       ORDER BY ${order}
       LIMIT ?`,
    )
    .bind(guildId, guildId, channelId, safeLimit)
    .all();

  return (result?.results || []).map(row => ({
    ...mapDocumentRow(row),
    accessChannels: String(row.access_channel_ids || '').split(',').filter(Boolean),
  }));
}

/**
 * Optimistic-concurrency update. With `baseUpdatedAt` the row is only written
 * if nobody saved in between. It never touches `archived_at`, never writes over
 * a document whose import is still pending, and drops the original upload only
 * when keeping it would push the row past D1's size limit.
 * Returns true when the row was written.
 */
export async function updateDocumentContent(db, documentId, document, {baseUpdatedAt = null} = {}) {
  const updatedAt = document.updatedAt || new Date().toISOString();
  const markdown = document.originalMarkdown || '';
  const markdownBytes = new TextEncoder().encode(markdown).byteLength;
  const result = await db
    .prepare(
      `UPDATE documents
       SET title = ?, description = ?, original_markdown = ?, pages = ?, updated_at = ?,
           updated_by = ?, updated_by_name = ?,
           source_blob = CASE
             WHEN source_blob IS NOT NULL AND LENGTH(source_blob) + ? > ? THEN NULL
             ELSE source_blob
           END
       WHERE id = ?
         AND COALESCE(import_status, 'ready') != 'pending'
         AND (? IS NULL OR COALESCE(NULLIF(updated_at, ''), created_at) = ?)`,
    )
    .bind(
      document.title || 'Sin título',
      document.description || '',
      markdown,
      JSON.stringify(document.pages || []),
      updatedAt,
      document.updatedBy || null,
      document.updatedByName || null,
      markdownBytes,
      MAX_ROW_PAYLOAD_BYTES,
      documentId,
      baseUpdatedAt,
      baseUpdatedAt,
    )
    .run();
  return Number(result?.meta?.changes ?? 1) > 0;
}

export async function archiveDocument(
  db,
  documentId,
  archivedAt = new Date().toISOString(),
  updatedBy = null,
  updatedByName = null,
) {
  await db
    .prepare(
      `UPDATE documents
       SET archived_at = ?, updated_at = ?, updated_by = ?, updated_by_name = ?
       WHERE id = ?`,
    )
    .bind(archivedAt, archivedAt, updatedBy, updatedByName, documentId)
    .run();
}

/**
 * Hard delete, only for documents that are already archived. Runs as one D1
 * batch (a transaction) and every statement is guarded by the same "is
 * archived" condition, so a concurrent restore can never leave an orphaned
 * document or ACL. Returns true when the document row was deleted.
 */
export async function deleteDocumentPermanently(db, documentId) {
  const archivedGuard = 'EXISTS (SELECT 1 FROM documents WHERE id = ? AND archived_at IS NOT NULL)';
  const results = await db.batch([
    db.prepare(`DELETE FROM document_channel_access WHERE document_id = ? AND ${archivedGuard}`)
      .bind(documentId, documentId),
    db.prepare(`DELETE FROM document_guild_access WHERE document_id = ? AND ${archivedGuard}`)
      .bind(documentId, documentId),
    db.prepare(`DELETE FROM docs_launch_intents WHERE document_id = ? AND ${archivedGuard}`)
      .bind(documentId, documentId),
    db.prepare(`DELETE FROM activity_contexts WHERE document_id = ? AND ${archivedGuard}`)
      .bind(documentId, documentId),
    db.prepare('DELETE FROM documents WHERE id = ? AND archived_at IS NOT NULL').bind(documentId),
  ]);
  return Number(results?.at(-1)?.meta?.changes || 0) > 0;
}

export async function restoreDocument(db, documentId) {
  const updatedAt = new Date().toISOString();
  await db
    .prepare('UPDATE documents SET archived_at = NULL, updated_at = ? WHERE id = ?')
    .bind(updatedAt, documentId)
    .run();
}

export async function loadDocumentSource(db, documentId) {
  const row = await db
    .prepare(
      `SELECT source_blob, source_mime, source_type, import_status
       FROM documents WHERE id = ?`,
    )
    .bind(documentId)
    .first();

  if (!row || !row.source_blob) return null;

  return {
    bytes: new Uint8Array(toArrayBuffer(row.source_blob)),
    mime: row.source_mime || 'application/octet-stream',
    type: row.source_type || null,
    importStatus: row.import_status || 'pending',
  };
}

/**
 * Stores the client-side conversion of a pending PDF/DOCX. It only applies
 * while the import is still pending, so a late or duplicated normalization can
 * never overwrite edits made after the first one. The original upload is kept
 * when the row still fits D1's size limit (so it can be re-imported).
 * Returns true when the row was written.
 */
export async function cacheNormalizedDocument(db, documentId, markdown, pages, metadata = {}) {
  const updatedAt = metadata.updatedAt || new Date().toISOString();
  const markdownBytes = new TextEncoder().encode(markdown || '').byteLength;
  const result = await db
    .prepare(
      `UPDATE documents
       SET original_markdown = ?, pages = ?, import_status = 'ready',
           source_blob = CASE
             WHEN source_blob IS NOT NULL AND LENGTH(source_blob) + ? > ? THEN NULL
             ELSE source_blob
           END,
           updated_at = ?, updated_by = ?, updated_by_name = ?
       WHERE id = ? AND import_status = 'pending'`,
    )
    .bind(
      markdown,
      JSON.stringify(pages),
      markdownBytes,
      MAX_ROW_PAYLOAD_BYTES,
      updatedAt,
      metadata.updatedBy || null,
      metadata.updatedByName || null,
      documentId,
    )
    .run();
  return Number(result?.meta?.changes ?? 1) > 0;
}

export function grantDocumentGuildAccessStatement(db, documentId, guildId, addedBy = null) {
  return db
    .prepare(
      `INSERT INTO document_guild_access (document_id, guild_id, added_at, added_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(document_id, guild_id) DO NOTHING`,
    )
    .bind(documentId, guildId, new Date().toISOString(), addedBy || null);
}

export async function grantDocumentGuildAccess(db, documentId, guildId, addedBy = null) {
  if (!documentId || !guildId) return;
  await grantDocumentGuildAccessStatement(db, documentId, guildId, addedBy).run();
}

export function grantDocumentChannelAccessStatement(db, documentId, guildId, channelId, addedBy = null) {
  return db
    .prepare(
      `INSERT INTO document_channel_access (document_id, guild_id, channel_id, added_at, added_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(document_id, channel_id) DO NOTHING`,
    )
    .bind(documentId, guildId, channelId, new Date().toISOString(), addedBy || null);
}

export async function grantDocumentChannelAccess(db, documentId, guildId, channelId, addedBy = null) {
  if (!documentId || !guildId || !channelId) return;
  await grantDocumentChannelAccessStatement(db, documentId, guildId, channelId, addedBy).run();
}

export async function listDocumentGuildIds(db, documentId) {
  if (!documentId) return [];
  const result = await db
    .prepare('SELECT guild_id FROM document_guild_access WHERE document_id = ?')
    .bind(documentId)
    .all();
  return (result?.results || []).map(row => String(row.guild_id || '')).filter(Boolean);
}

export async function listDocumentChannelAccess(db, documentId, guildId) {
  if (!documentId || !guildId) return [];
  const result = await db
    .prepare(
      `SELECT channel_id
       FROM document_channel_access
       WHERE document_id = ? AND guild_id = ?
       ORDER BY added_at ASC`,
    )
    .bind(documentId, guildId)
    .all();
  return (result?.results || []).map(row => String(row.channel_id || '')).filter(Boolean);
}

export async function documentHasChannelAccess(db, documentId, guildId, channelId) {
  if (!documentId || !guildId || !channelId) return false;
  const row = await db
    .prepare(
      `SELECT 1 AS allowed
       FROM document_channel_access
       WHERE document_id = ? AND guild_id = ? AND channel_id = ?
       LIMIT 1`,
    )
    .bind(documentId, guildId, channelId)
    .first();
  return Boolean(row?.allowed);
}

export async function adoptLegacyDocumentsForGuild(db, guildId, userId = null) {
  if (!db || !guildId) return 0;
  const addedAt = new Date().toISOString();
  try {
    const res = await db
      .prepare(
        `INSERT INTO document_guild_access (document_id, guild_id, added_at, added_by)
         SELECT d.id, ?, ?, ?
         FROM documents d
         WHERE d.archived_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM document_guild_access a WHERE a.document_id = d.id
           )`,
      )
      .bind(guildId, addedAt, userId)
      .run();
    return res?.meta?.changes || 0;
  } catch (error) {
    console.error('Error adopting legacy documents for guild:', error);
    return 0;
  }
}

/** Cheap existence probe (index lookup) instead of COUNT(*) on every request. */
export async function hasAnyDocumentGuildAccess(db) {
  const row = await db.prepare('SELECT 1 AS found FROM document_guild_access LIMIT 1').first();
  return Boolean(row?.found);
}

export async function documentHasGuildAccess(db, documentId, guildId) {
  if (!documentId || !guildId) return false;
  const row = await db
    .prepare('SELECT 1 AS allowed FROM document_guild_access WHERE document_id = ? AND guild_id = ? LIMIT 1')
    .bind(documentId, guildId)
    .first();
  return Boolean(row?.allowed);
}

export async function saveDocsLaunchIntent(db, userId, guildId, documentId, channelId = null) {
  if (!userId || !guildId || !documentId) return;
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO docs_launch_intents (user_id, guild_id, document_id, channel_id, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, guild_id) DO UPDATE SET
         document_id = excluded.document_id,
         channel_id = excluded.channel_id,
         created_at = excluded.created_at`,
    )
    .bind(userId, guildId, documentId, channelId || null, createdAt)
    .run();
}

export async function loadRecentDocsLaunchIntent(db, userId, guildId, maxAgeMs = 10 * 60 * 1000) {
  if (!userId || !guildId) return null;
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const row = await db
    .prepare(
      `SELECT user_id, guild_id, document_id, channel_id, created_at
       FROM docs_launch_intents
       WHERE user_id = ? AND guild_id = ? AND created_at >= ?
       LIMIT 1`,
    )
    .bind(userId, guildId, cutoff)
    .first();

  if (!row) return null;
  return {
    userId: row.user_id,
    guildId: row.guild_id,
    documentId: row.document_id,
    channelId: row.channel_id || null,
    createdAt: row.created_at,
  };
}

/**
 * Launch intents also carry non-document destinations ("target:planner",
 * "target:new-doc:<título>", ...). Those are one-shot: the Activity consumes
 * them on boot so a later launch from the app launcher isn't re-routed.
 */
export const LAUNCH_TARGET_PREFIX = 'target:';

export async function deleteDocsLaunchIntent(db, userId, guildId, documentId) {
  if (!userId || !guildId || !documentId) return;
  await db
    .prepare('DELETE FROM docs_launch_intents WHERE user_id = ? AND guild_id = ? AND document_id = ?')
    .bind(userId, guildId, documentId)
    .run();
}

export async function saveDocsSession(db, tokenHash, session) {
  await db
    .prepare(
      `INSERT INTO docs_sessions (token_hash, user_id, guild_id, channel_id, username, avatar, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(token_hash) DO UPDATE SET
         user_id = excluded.user_id,
         guild_id = excluded.guild_id,
         channel_id = excluded.channel_id,
         username = excluded.username,
         avatar = excluded.avatar,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at`,
    )
    .bind(
      tokenHash,
      session.userId,
      session.guildId,
      session.channelId || null,
      session.username || null,
      session.avatar || null,
      session.createdAt,
      session.expiresAt,
    )
    .run();
}

export async function loadDocsSession(db, tokenHash) {
  const row = await db
    .prepare(
      `SELECT token_hash, user_id, guild_id, channel_id, username, avatar, created_at, expires_at
       FROM docs_sessions WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first();

  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    guildId: row.guild_id,
    channelId: row.channel_id || null,
    username: row.username || null,
    avatar: row.avatar || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function deleteDocsSession(db, tokenHash) {
  await db.prepare('DELETE FROM docs_sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export async function deleteExpiredDocsSessions(db, now = new Date().toISOString()) {
  await db.prepare('DELETE FROM docs_sessions WHERE expires_at <= ?').bind(now).run();
}

export async function saveActivityContext(db, instanceId, documentId) {
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO activity_contexts (instance_id, document_id, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(instance_id) DO UPDATE SET
         document_id = excluded.document_id,
         created_at = excluded.created_at`,
    )
    .bind(instanceId, documentId, createdAt)
    .run();
}

export async function loadActivityContext(db, instanceId) {
  const row = await db
    .prepare('SELECT instance_id, document_id, created_at FROM activity_contexts WHERE instance_id = ?')
    .bind(instanceId)
    .first();

  if (!row) return null;

  return {
    instanceId: row.instance_id,
    documentId: row.document_id,
    createdAt: row.created_at,
  };
}

function parseJsonSafe(val, fallback) {
  try {
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

function mapPlannerSessionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    title: row.title,
    hostId: row.host_id || null,
    hostName: row.host_name || null,
    date: row.date,
    startTime: row.start_time,
    targetDuration: Number(row.target_duration || 60),
    description: row.description || '',
    mentions: row.mentions || '',
    blocks: parseJsonSafe(row.blocks_json, []),
    status: row.status || 'scheduled',
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Live state as the client knows it. New rows keep the full client object in
 * `state_json`; rows written before migration 0012 are mapped from the legacy
 * columns to the same shape (legacy keys are kept for older clients).
 */
function mapPlannerLiveSessionRow(row) {
  if (!row) return null;

  const stored = parseJsonSafe(row.state_json, null);
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    return {
      ...stored,
      sessionId: stored.sessionId || row.session_id,
      plannerSessionId: row.session_id,
      updatedAt: stored.updatedAt || row.updated_at,
    };
  }

  const blockStartedAt = row.block_started_at ? Number(row.block_started_at) : null;
  const sessionStartedAt = row.session_started_at ? Number(row.session_started_at) : null;
  const sessionPausedAt = row.session_paused_at ? Number(row.session_paused_at) : null;
  const totalPausedMs = Number(row.total_paused_ms || 0);
  const decisions = parseJsonSafe(row.decisions_json, []);
  const recordingsMeta = parseJsonSafe(row.recordings_meta_json, []);
  return {
    sessionId: row.session_id,
    status: row.status || 'idle',
    liveActiveBlockId: row.active_block_id || null,
    liveActivePointId: row.active_point_id || null,
    activeBlockStartedAt: blockStartedAt,
    sessionStartedAt,
    pausedAt: sessionPausedAt,
    accumulatedPausedMs: totalPausedMs,
    decisions,
    recordings: recordingsMeta,
    updatedAt: row.updated_at,
    // Legacy field names, kept so older clients keep working.
    guildId: row.guild_id,
    channelId: row.channel_id,
    activeBlockId: row.active_block_id || null,
    activePointId: row.active_point_id || null,
    blockStartedAt,
    blockElapsedBeforePauseMs: Number(row.block_elapsed_before_pause_ms || 0),
    sessionPausedAt,
    totalPausedMs,
    recordingsMeta,
    updatedBy: row.updated_by,
  };
}

function plannerSessionBindings(session, now) {
  return [
    session.id,
    session.guildId,
    session.channelId,
    session.title || 'Nueva sesión',
    session.hostId || null,
    session.hostName || null,
    session.date || now.split('T')[0],
    session.startTime || '10:00',
    session.targetDuration || 60,
    session.description || '',
    session.mentions || '',
    JSON.stringify(session.blocks || []),
    session.status || 'scheduled',
    session.createdAt || now,
    session.createdBy || 'unknown',
    session.updatedAt || now,
    session.updatedBy || session.createdBy || 'unknown',
  ];
}

/**
 * Insert or update a planner session. The ON CONFLICT branch only fires for a
 * row of the same guild AND channel, so a client-chosen id can never overwrite
 * another channel's meeting. Returns true when a row was written.
 */
export async function savePlannerSession(db, session) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO planner_sessions (
         id, guild_id, channel_id, title, host_id, host_name, date, start_time,
         target_duration, description, mentions, blocks_json, status, created_at,
         created_by, updated_at, updated_by
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         host_id = excluded.host_id,
         host_name = excluded.host_name,
         date = excluded.date,
         start_time = excluded.start_time,
         target_duration = excluded.target_duration,
         description = excluded.description,
         mentions = excluded.mentions,
         blocks_json = excluded.blocks_json,
         status = excluded.status,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by
       WHERE planner_sessions.guild_id = excluded.guild_id
         AND planner_sessions.channel_id = excluded.channel_id`,
    )
    .bind(...plannerSessionBindings(session, now))
    .run();
  return Number(result?.meta?.changes ?? 1) > 0;
}

/**
 * Scoped optimistic-concurrency update used by PATCH. With `baseUpdatedAt`
 * the row is only written when nobody saved in between. Returns true when the
 * row was written.
 */
export async function updatePlannerSession(db, session, {baseUpdatedAt = null} = {}) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE planner_sessions
       SET title = ?, host_id = ?, host_name = ?, date = ?, start_time = ?, target_duration = ?,
           description = ?, mentions = ?, blocks_json = ?, status = ?, updated_at = ?, updated_by = ?
       WHERE id = ? AND guild_id = ? AND channel_id = ?
         AND (? IS NULL OR updated_at = ?)`,
    )
    .bind(
      session.title || 'Nueva sesión',
      session.hostId || null,
      session.hostName || null,
      session.date || now.split('T')[0],
      session.startTime || '10:00',
      session.targetDuration || 60,
      session.description || '',
      session.mentions || '',
      JSON.stringify(session.blocks || []),
      session.status || 'scheduled',
      session.updatedAt || now,
      session.updatedBy || 'unknown',
      session.id,
      session.guildId,
      session.channelId,
      baseUpdatedAt,
      baseUpdatedAt,
    )
    .run();
  return Number(result?.meta?.changes ?? 1) > 0;
}

/** Unscoped lookup used only to detect id collisions across guilds/channels. */
export async function loadPlannerSessionOwner(db, sessionId) {
  const row = await db
    .prepare('SELECT id, guild_id, channel_id FROM planner_sessions WHERE id = ?')
    .bind(sessionId)
    .first();
  return row ? {id: row.id, guildId: row.guild_id, channelId: row.channel_id} : null;
}

export async function loadPlannerSession(db, sessionId, guildId, channelId) {
  const row = await db
    .prepare(
      `SELECT * FROM planner_sessions
       WHERE id = ? AND guild_id = ? AND channel_id = ?`,
    )
    .bind(sessionId, guildId, channelId)
    .first();

  return mapPlannerSessionRow(row);
}

export async function listPlannerSessionsForChannel(db, guildId, channelId, limit = 20) {
  const { results } = await db
    .prepare(
      `SELECT * FROM planner_sessions
       WHERE guild_id = ? AND channel_id = ? AND (status IS NULL OR status != 'archived')
       ORDER BY date DESC, created_at DESC
       LIMIT ?`,
    )
    .bind(guildId, channelId, limit)
    .all();

  return (results || []).map(mapPlannerSessionRow);
}

export async function listArchivedPlannerSessionsForChannel(db, guildId, channelId, limit = 20) {
  const { results } = await db
    .prepare(
      `SELECT * FROM planner_sessions
       WHERE guild_id = ? AND channel_id = ? AND status = 'archived'
       ORDER BY updated_at DESC, date DESC
       LIMIT ?`,
    )
    .bind(guildId, channelId, limit)
    .all();

  return (results || []).map(mapPlannerSessionRow);
}

export async function restorePlannerSession(db, sessionId, guildId, channelId, userId) {
  // Status-only change: updated_at is the content version used by PATCH
  // baseUpdatedAt, so archiving/restoring must not bump it.
  await db
    .prepare(
      `UPDATE planner_sessions
       SET status = 'scheduled', updated_by = ?
       WHERE id = ? AND guild_id = ? AND channel_id = ?`,
    )
    .bind(userId, sessionId, guildId, channelId)
    .run();
}

/**
 * Deletes a meeting and its live state atomically. Both statements are scoped
 * to the caller's guild+channel, so another channel's live state can never be
 * wiped. Returns true when the meeting row was deleted.
 */
export async function deletePlannerSessionPermanently(db, sessionId, guildId, channelId) {
  const results = await db.batch([
    db.prepare(
      `DELETE FROM planner_live_sessions
       WHERE session_id = ?
         AND EXISTS (
           SELECT 1 FROM planner_sessions WHERE id = ? AND guild_id = ? AND channel_id = ?
         )`,
    ).bind(sessionId, sessionId, guildId, channelId),
    db.prepare('DELETE FROM planner_sessions WHERE id = ? AND guild_id = ? AND channel_id = ?')
      .bind(sessionId, guildId, channelId),
  ]);
  return Number(results?.at(-1)?.meta?.changes || 0) > 0;
}

export async function archivePlannerSession(db, sessionId, guildId, channelId, userId) {
  // Status-only change: updated_at is the content version used by PATCH
  // baseUpdatedAt, so archiving/restoring must not bump it.
  await db
    .prepare(
      `UPDATE planner_sessions
       SET status = 'archived', updated_by = ?
       WHERE id = ? AND guild_id = ? AND channel_id = ?`,
    )
    .bind(userId, sessionId, guildId, channelId)
    .run();
}

/**
 * Mirrors the live runner status onto the meeting row so lists (/reus, the
 * Activity index) show it correctly. It never touches archived meetings and
 * does not bump `updated_at` (that would make every open editor conflict).
 */
function plannerStatusFromLiveStatement(db, sessionId, guildId, channelId, liveStatus) {
  const scope = 'id = ? AND guild_id = ? AND channel_id = ? AND (status IS NULL OR status != \'archived\')';
  if (liveStatus === 'running' || liveStatus === 'paused') {
    return db.prepare(`UPDATE planner_sessions SET status = 'live' WHERE ${scope}`)
      .bind(sessionId, guildId, channelId);
  }
  if (liveStatus === 'completed') {
    return db.prepare(`UPDATE planner_sessions SET status = 'completed' WHERE ${scope}`)
      .bind(sessionId, guildId, channelId);
  }
  if (liveStatus === 'idle') {
    return db.prepare(`UPDATE planner_sessions SET status = 'scheduled' WHERE ${scope} AND status = 'live'`)
      .bind(sessionId, guildId, channelId);
  }
  return null;
}

/**
 * Stores the full client live state verbatim (`state_json`) plus the legacy
 * columns that can be derived from it, and syncs the meeting status, in one
 * batch. The caller must have verified that the meeting belongs to the
 * guild+channel (the FK would otherwise surface as a 500).
 */
export async function saveLiveSessionState(db, liveState) {
  const now = new Date().toISOString();
  const statements = [db
    .prepare(
      `INSERT INTO planner_live_sessions (
         session_id, guild_id, channel_id, status, active_block_id, active_point_id,
         block_started_at, block_elapsed_before_pause_ms, session_started_at,
         session_paused_at, total_paused_ms, decisions_json, recordings_meta_json,
         updated_at, updated_by, state_json
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         guild_id = excluded.guild_id,
         channel_id = excluded.channel_id,
         state_json = excluded.state_json,
         status = excluded.status,
         active_block_id = excluded.active_block_id,
         active_point_id = excluded.active_point_id,
         block_started_at = excluded.block_started_at,
         block_elapsed_before_pause_ms = excluded.block_elapsed_before_pause_ms,
         session_started_at = excluded.session_started_at,
         session_paused_at = excluded.session_paused_at,
         total_paused_ms = excluded.total_paused_ms,
         decisions_json = excluded.decisions_json,
         recordings_meta_json = excluded.recordings_meta_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(
      liveState.sessionId,
      liveState.guildId,
      liveState.channelId,
      liveState.status || 'idle',
      liveState.activeBlockId || null,
      liveState.activePointId || null,
      liveState.blockStartedAt || null,
      liveState.blockElapsedBeforePauseMs || 0,
      liveState.sessionStartedAt || null,
      liveState.sessionPausedAt || null,
      liveState.totalPausedMs || 0,
      JSON.stringify(liveState.decisions || []),
      JSON.stringify(liveState.recordingsMeta || []),
      now,
      liveState.updatedBy || 'unknown',
      liveState.stateJson ?? null,
    )];

  const statusStatement = plannerStatusFromLiveStatement(
    db,
    liveState.sessionId,
    liveState.guildId,
    liveState.channelId,
    liveState.status,
  );
  if (statusStatement) statements.push(statusStatement);
  await db.batch(statements);
}

export async function loadLiveSessionState(db, sessionId) {
  const row = await db
    .prepare('SELECT * FROM planner_live_sessions WHERE session_id = ?')
    .bind(sessionId)
    .first();

  return mapPlannerLiveSessionRow(row);
}

/**
 * Housekeeping for the daily cron. Only removes data that is expired by
 * definition: auth sessions past `expires_at`, launch intents (valid 10 min)
 * older than a day and Activity instance contexts older than 30 days. It never
 * touches documents, ACLs or meetings.
 */
export async function cleanupExpiredRecords(db, now = new Date()) {
  const nowIso = now.toISOString();
  const intentCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const contextCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const results = await db.batch([
    db.prepare('DELETE FROM docs_sessions WHERE expires_at <= ?').bind(nowIso),
    db.prepare('DELETE FROM docs_launch_intents WHERE created_at < ?').bind(intentCutoff),
    db.prepare('DELETE FROM activity_contexts WHERE created_at < ?').bind(contextCutoff),
  ]);
  return {
    sessions: Number(results?.[0]?.meta?.changes || 0),
    launchIntents: Number(results?.[1]?.meta?.changes || 0),
    activityContexts: Number(results?.[2]?.meta?.changes || 0),
  };
}
