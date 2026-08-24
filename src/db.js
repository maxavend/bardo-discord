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
    sourceMime: row.source_mime || null,
    sourceType: row.source_type || 'markdown',
    importStatus: row.import_status || 'ready',
    hasSource: Boolean(row.has_source),
  };
}

export async function saveDocument(db, messageId, document) {
  await db
    .prepare(
      `INSERT INTO documents (id, title, original_markdown, pages, source_name, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         original_markdown = excluded.original_markdown,
         pages = excluded.pages,
         source_name = excluded.source_name,
         created_at = excluded.created_at,
         created_by = excluded.created_by`,
    )
    .bind(
      messageId,
      document.title,
      document.originalMarkdown || '',
      JSON.stringify(document.pages),
      document.sourceName || null,
      document.createdAt,
      document.createdBy,
    )
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
    .prepare(
      `SELECT id, title, description, original_markdown, pages, source_name, created_at, updated_at,
              archived_at, created_by, source_mime, source_type, import_status,
              CASE WHEN source_blob IS NULL THEN 0 ELSE 1 END AS has_source
       FROM documents WHERE id = ?`,
    )
    .bind(messageId)
    .first();

  return mapDocumentRow(row);
}

export async function listDocuments(db, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
  const result = await db
    .prepare(
      `SELECT id, title, description, original_markdown, pages, source_name, created_at, updated_at,
              archived_at, created_by, source_mime, source_type, import_status,
              CASE WHEN source_blob IS NULL THEN 0 ELSE 1 END AS has_source
       FROM documents
       WHERE archived_at IS NULL
       ORDER BY COALESCE(updated_at, created_at) DESC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all();

  return (result?.results || []).map(mapDocumentRow).filter(Boolean);
}

export async function listDocumentsForGuild(db, guildId, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
  const result = await db
    .prepare(
      `SELECT d.id, d.title, d.description, d.original_markdown, d.pages, d.source_name,
              d.created_at, d.updated_at, d.archived_at, d.created_by, d.source_mime,
              d.source_type, d.import_status,
              CASE WHEN d.source_blob IS NULL THEN 0 ELSE 1 END AS has_source
       FROM documents d
       INNER JOIN document_guild_access a ON a.document_id = d.id
       WHERE a.guild_id = ? AND d.archived_at IS NULL
       ORDER BY COALESCE(d.updated_at, d.created_at) DESC
       LIMIT ?`,
    )
    .bind(guildId, safeLimit)
    .all();

  return (result?.results || []).map(mapDocumentRow).filter(Boolean);
}

export async function updateDocumentContent(db, documentId, document) {
  const updatedAt = document.updatedAt || new Date().toISOString();
  await db
    .prepare(
      `UPDATE documents
       SET title = ?, description = ?, original_markdown = ?, pages = ?, updated_at = ?, archived_at = NULL
       WHERE id = ?`,
    )
    .bind(
      document.title || 'Sin título',
      document.description || '',
      document.originalMarkdown || '',
      JSON.stringify(document.pages || []),
      updatedAt,
      documentId,
    )
    .run();
}

export async function archiveDocument(db, documentId, archivedAt = new Date().toISOString()) {
  await db
    .prepare('UPDATE documents SET archived_at = ?, updated_at = ? WHERE id = ?')
    .bind(archivedAt, archivedAt, documentId)
    .run();
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

export async function cacheNormalizedDocument(db, documentId, markdown, pages) {
  await db
    .prepare(
      `UPDATE documents
       SET original_markdown = ?, pages = ?, import_status = 'ready', source_blob = NULL,
           updated_at = COALESCE(updated_at, created_at)
       WHERE id = ?`,
    )
    .bind(markdown, JSON.stringify(pages), documentId)
    .run();
}

export async function grantDocumentGuildAccess(db, documentId, guildId, addedBy = null) {
  if (!documentId || !guildId) return;
  const addedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO document_guild_access (document_id, guild_id, added_at, added_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(document_id, guild_id) DO NOTHING`,
    )
    .bind(documentId, guildId, addedAt, addedBy || null)
    .run();
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

export async function documentHasGuildAccess(db, documentId, guildId) {
  if (!documentId || !guildId) return false;
  const row = await db
    .prepare('SELECT 1 AS allowed FROM document_guild_access WHERE document_id = ? AND guild_id = ? LIMIT 1')
    .bind(documentId, guildId)
    .first();
  return Boolean(row?.allowed);
}

export async function saveDocsLaunchIntent(db, userId, guildId, documentId) {
  if (!userId || !guildId || !documentId) return;
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO docs_launch_intents (user_id, guild_id, document_id, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, guild_id) DO UPDATE SET
         document_id = excluded.document_id,
         created_at = excluded.created_at`,
    )
    .bind(userId, guildId, documentId, createdAt)
    .run();
}

export async function loadRecentDocsLaunchIntent(db, userId, guildId, maxAgeMs = 10 * 60 * 1000) {
  if (!userId || !guildId) return null;
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const row = await db
    .prepare(
      `SELECT user_id, guild_id, document_id, created_at
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
    createdAt: row.created_at,
  };
}

export async function saveDocsSession(db, tokenHash, session) {
  await db
    .prepare(
      `INSERT INTO docs_sessions (token_hash, user_id, guild_id, username, avatar, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(token_hash) DO UPDATE SET
         user_id = excluded.user_id,
         guild_id = excluded.guild_id,
         username = excluded.username,
         avatar = excluded.avatar,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at`,
    )
    .bind(
      tokenHash,
      session.userId,
      session.guildId,
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
      `SELECT token_hash, user_id, guild_id, username, avatar, created_at, expires_at
       FROM docs_sessions WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first();

  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    guildId: row.guild_id,
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