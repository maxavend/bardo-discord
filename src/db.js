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
