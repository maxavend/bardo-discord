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

export async function saveDiscordMessageReference(db, documentId, channelId, messageId) {
  await db
    .prepare(
      `UPDATE documents
       SET discord_channel_id = ?, discord_message_id = ?
       WHERE id = ?`,
    )
    .bind(channelId || null, messageId || null, documentId)
    .run();
}

export async function loadDocument(db, messageId) {
  const row = await db
    .prepare(
      `SELECT id, title, original_markdown, pages, source_name, created_at, created_by,
              source_mime, source_type, import_status, updated_at,
              discord_channel_id, discord_message_id,
              CASE WHEN source_blob IS NULL THEN 0 ELSE 1 END AS has_source
       FROM documents WHERE id = ?`,
    )
    .bind(messageId)
    .first();

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    originalMarkdown: row.original_markdown,
    pages: JSON.parse(row.pages),
    sourceName: row.source_name,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at || null,
    discordChannelId: row.discord_channel_id || null,
    discordMessageId: row.discord_message_id || null,
    sourceMime: row.source_mime || null,
    sourceType: row.source_type || 'markdown',
    importStatus: row.import_status || 'ready',
    hasSource: Boolean(row.has_source),
  };
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
       SET original_markdown = ?, pages = ?, import_status = 'ready', source_blob = NULL
       WHERE id = ?`,
    )
    .bind(markdown, JSON.stringify(pages), documentId)
    .run();
}

export async function updateDocumentContent(db, documentId, { title, markdown, pages, updatedAt }) {
  await db
    .prepare(
      `UPDATE documents
       SET title = ?, original_markdown = ?, pages = ?, updated_at = ?,
           import_status = 'ready', source_blob = NULL
       WHERE id = ?`,
    )
    .bind(title, markdown, JSON.stringify(pages), updatedAt, documentId)
    .run();
}

export async function saveActivityContext(db, instanceId, documentId, userId = null) {
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO activity_contexts (instance_id, document_id, created_at, user_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(instance_id) DO UPDATE SET
         document_id = excluded.document_id,
         created_at = excluded.created_at,
         user_id = excluded.user_id`,
    )
    .bind(instanceId, documentId, createdAt, userId)
    .run();
}

export async function loadActivityContext(db, instanceId) {
  const row = await db
    .prepare('SELECT instance_id, document_id, created_at, user_id FROM activity_contexts WHERE instance_id = ?')
    .bind(instanceId)
    .first();

  if (!row) return null;

  return {
    instanceId: row.instance_id,
    documentId: row.document_id,
    createdAt: row.created_at,
    userId: row.user_id || null,
  };
}
