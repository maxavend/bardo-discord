import { listBlocks, listItems, listParticipants } from './event-db.js';

function requireBatch(db) {
  if (!db || typeof db.batch !== 'function') {
    throw new Error('Esta operación requiere soporte transaccional D1 batch().');
  }
}

function uniqueIds(ids, label) {
  if (!Array.isArray(ids)) throw new Error(`${label} debe ser un array.`);
  const clean = ids.map((id) => String(id || '').trim());
  if (clean.some((id) => !id)) throw new Error(`${label} contiene un ID vacío.`);
  if (new Set(clean).size !== clean.length) throw new Error(`${label} contiene IDs duplicados.`);
  return clean;
}

function sameSet(left, right) {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return right.every((value) => expected.has(value));
}

function sanitizeParticipants(participants) {
  if (!Array.isArray(participants)) throw new Error('participants debe ser un array.');
  const seen = new Set();
  const clean = [];
  for (const person of participants.slice(0, 100)) {
    const userId = String(person?.userId || person?.id || '').trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    clean.push({
      userId,
      displayName: String(person?.displayName || person?.name || userId).trim().slice(0, 100),
      avatarUrl: person?.avatarUrl || null,
      role: person?.role === 'optional' ? 'optional' : 'participant',
    });
  }
  return clean;
}

export async function replaceParticipantsAtomic(db, eventId, participants) {
  requireBatch(db);
  const clean = sanitizeParticipants(participants);
  const statements = [db.prepare('DELETE FROM event_participants WHERE event_id = ?').bind(eventId)];
  for (const person of clean) {
    statements.push(db.prepare(
      `INSERT INTO event_participants (event_id, user_id, display_name, avatar_url, role)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(eventId, person.userId, person.displayName, person.avatarUrl, person.role));
  }
  statements.push(db.prepare('UPDATE events SET updated_at = ? WHERE id = ?').bind(new Date().toISOString(), eventId));
  await db.batch(statements);
  return listParticipants(db, eventId);
}

export async function reorderBlocksAtomic(db, eventId, ids) {
  requireBatch(db);
  const requested = uniqueIds(ids, 'ids');
  const rows = await db.prepare('SELECT id FROM event_blocks WHERE event_id = ? ORDER BY position ASC, created_at ASC').bind(eventId).all();
  const existing = (rows.results || []).map((row) => String(row.id));
  if (!sameSet(existing, requested)) throw new Error('El orden enviado no contiene exactamente los bloques del evento.');

  const now = new Date().toISOString();
  const statements = requested.map((id, index) => db
    .prepare('UPDATE event_blocks SET position = ?, updated_at = ? WHERE id = ? AND event_id = ?')
    .bind(index, now, id, eventId));
  statements.push(db.prepare('UPDATE events SET updated_at = ? WHERE id = ?').bind(now, eventId));
  await db.batch(statements);
  return listBlocks(db, eventId);
}

export async function reorderItemsAtomic(db, eventId, blockId, ids) {
  requireBatch(db);
  const requested = uniqueIds(ids, 'ids');
  const block = await db.prepare('SELECT id FROM event_blocks WHERE id = ? AND event_id = ?').bind(blockId, eventId).first();
  if (!block) throw new Error('El bloque no pertenece a este evento.');

  const rows = await db.prepare('SELECT id FROM event_items WHERE block_id = ? ORDER BY position ASC, created_at ASC').bind(blockId).all();
  const existing = (rows.results || []).map((row) => String(row.id));
  if (!sameSet(existing, requested)) throw new Error('El orden enviado no contiene exactamente los puntos del bloque.');

  const now = new Date().toISOString();
  const statements = requested.map((id, index) => db
    .prepare('UPDATE event_items SET position = ?, updated_at = ? WHERE id = ? AND block_id = ?')
    .bind(index, now, id, blockId));
  statements.push(db.prepare('UPDATE events SET updated_at = ? WHERE id = ?').bind(now, eventId));
  await db.batch(statements);
  return listItems(db, blockId);
}
