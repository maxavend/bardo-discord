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

export async function loadDocument(db, messageId) {
  const row = await db
    .prepare('SELECT id, title, original_markdown, pages, source_name, created_at, created_by FROM documents WHERE id = ?')
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
  };
}
