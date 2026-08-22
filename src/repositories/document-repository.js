import { loadDocument, saveDocument } from '../db.js';

export async function getDocument(db, documentId) {
  return loadDocument(db, documentId);
}

export async function putDocument(db, documentId, document) {
  await saveDocument(db, documentId, document);
  return loadDocument(db, documentId);
}

export async function searchGuildDocuments(db, guildId, query = '', limit = 25) {
  const clean = String(query || '').trim();
  const safeLimit = Math.max(1, Math.min(25, Number(limit) || 25));
  const result = await db.prepare(`SELECT DISTINCT d.id, d.title, d.created_at
    FROM documents d JOIN activity_contexts a ON a.document_id = d.id
    WHERE a.guild_id = ? AND (? = '' OR d.title LIKE ? COLLATE NOCASE)
    ORDER BY d.created_at DESC LIMIT ?`)
    .bind(String(guildId), clean, `%${clean}%`, safeLimit).all();
  return result.results || [];
}
