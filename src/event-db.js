import {
  cleanDuration,
  normalizeEventBlockType,
  normalizeEventItemStatus,
  normalizeEventStatus,
  sanitizeLink,
  linkLabel,
  zonedDateTimeToUtcIso,
} from './event.js';

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    title: row.title,
    description: row.description || '',
    eventDate: row.event_date,
    startTime: row.start_time,
    timezone: row.timezone || 'America/Santiago',
    startsAt: row.starts_at || null,
    expectedDuration: Number(row.duration_minutes || 0),
    status: normalizeEventStatus(row.status),
    channelId: row.channel_id || null,
    createdBy: row.created_by,
    minuteDocumentId: row.minute_document_id || null,
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPerson(row) {
  return { userId: row.user_id, displayName: row.display_name || row.user_id, avatarUrl: row.avatar_url || null, role: row.role || 'participant' };
}

function mapBlock(row) {
  return {
    id: row.id, eventId: row.event_id, title: row.title, description: row.description || '',
    durationMinutes: Number(row.duration_minutes || 0), position: Number(row.position || 0),
    type: normalizeEventBlockType(row.block_type), status: normalizeEventItemStatus(row.status, 'pending'),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapItem(row) {
  return {
    id: row.id, blockId: row.block_id, title: row.title, description: row.description || '',
    durationMinutes: Number(row.duration_minutes || 0), position: Number(row.position || 0),
    status: normalizeEventItemStatus(row.status), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapLink(row) {
  return { id: row.id, eventId: row.event_id || null, blockId: row.block_id || null, itemId: row.item_id || null, label: row.label || linkLabel(row.url), url: row.url, position: Number(row.position || 0) };
}

function mapNote(row) {
  return { id: row.id, eventId: row.event_id, blockId: row.block_id || null, itemId: row.item_id || null, content: row.content, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapDecision(row) {
  return { id: row.id, eventId: row.event_id, blockId: row.block_id || null, itemId: row.item_id || null, content: row.content, createdBy: row.created_by, createdAt: row.created_at };
}

async function all(db, sql, ...binds) {
  const result = await db.prepare(sql).bind(...binds).all();
  return result.results || [];
}

export async function createEvent(db, input) {
  const now = new Date().toISOString();
  const id = input.id || crypto.randomUUID();
  const title = String(input.title || '').trim().slice(0, 160);
  if (!title) throw new Error('El evento necesita un título.');
  const eventDate = String(input.eventDate || '').trim();
  const startTime = String(input.startTime || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error('La fecha debe usar YYYY-MM-DD.');
  if (!/^\d{2}:\d{2}$/.test(startTime)) throw new Error('La hora debe usar HH:MM.');
  const timezone = String(input.timezone || 'America/Santiago').trim().slice(0, 80);
  const startsAt = input.startsAt || zonedDateTimeToUtcIso(eventDate, startTime, timezone);
  const duration = cleanDuration(input.expectedDuration, 60, 12 * 60);
  const status = normalizeEventStatus(input.status, 'scheduled');

  await db.prepare(`INSERT INTO events (
      id, guild_id, title, description, event_date, start_time, timezone, starts_at,
      duration_minutes, status, channel_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.guildId, title, String(input.description || '').trim().slice(0, 2000) || null,
      eventDate, startTime, timezone, startsAt, duration, status, input.channelId || null,
      input.createdBy || 'unknown', now, now).run();

  if (Array.isArray(input.participants) && input.participants.length) await replaceParticipants(db, id, input.participants);
  return loadEvent(db, id);
}

export async function updateEvent(db, eventId, fields = {}) {
  const current = await loadEvent(db, eventId);
  if (!current) return null;
  const title = fields.title !== undefined ? String(fields.title || '').trim().slice(0, 160) : current.title;
  if (!title) throw new Error('El evento necesita un título.');
  const description = fields.description !== undefined ? String(fields.description || '').trim().slice(0, 2000) : current.description;
  const eventDate = fields.eventDate !== undefined ? String(fields.eventDate || '').trim() : current.eventDate;
  const startTime = fields.startTime !== undefined ? String(fields.startTime || '').trim() : current.startTime;
  const timezone = fields.timezone !== undefined ? String(fields.timezone || 'America/Santiago').trim().slice(0, 80) : current.timezone;
  const startsAt = fields.startsAt || zonedDateTimeToUtcIso(eventDate, startTime, timezone);
  const expectedDuration = fields.expectedDuration !== undefined ? cleanDuration(fields.expectedDuration, current.expectedDuration, 12 * 60) : current.expectedDuration;
  const status = fields.status !== undefined ? normalizeEventStatus(fields.status, current.status) : current.status;
  const channelId = fields.channelId !== undefined ? fields.channelId || null : current.channelId;
  const now = new Date().toISOString();
  await db.prepare(`UPDATE events SET title = ?, description = ?, event_date = ?, start_time = ?, timezone = ?, starts_at = ?,
      duration_minutes = ?, status = ?, channel_id = ?, updated_at = ? WHERE id = ?`)
    .bind(title, description || null, eventDate, startTime, timezone, startsAt, expectedDuration, status, channelId, now, eventId).run();
  if (Array.isArray(fields.participants)) await replaceParticipants(db, eventId, fields.participants);
  return loadEventFull(db, eventId);
}

export async function deleteEvent(db, eventId) {
  const event = await loadEvent(db, eventId);
  if (!event) return null;
  await db.prepare('DELETE FROM events WHERE id = ?').bind(eventId).run();
  return { ok: true, id: eventId };
}

export async function loadEvent(db, eventId) {
  return mapEvent(await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first());
}

export async function findEvent(db, guildId, value) {
  const key = String(value || '').trim();
  if (!key) return null;
  return mapEvent(await db.prepare(`SELECT * FROM events WHERE guild_id = ? AND (id = ? OR title = ? COLLATE NOCASE)
     ORDER BY starts_at DESC LIMIT 1`).bind(guildId, key, key).first());
}

export async function listEvents(db, guildId, { limit = 50, from, to, status } = {}) {
  const conditions = ['guild_id = ?'];
  const binds = [guildId];
  if (from) { conditions.push('starts_at >= ?'); binds.push(from); }
  if (to) { conditions.push('starts_at <= ?'); binds.push(to); }
  if (status) { conditions.push('status = ?'); binds.push(normalizeEventStatus(status)); }
  binds.push(Math.max(1, Math.min(100, Number(limit) || 50)));
  const rows = await all(db, `SELECT * FROM events WHERE ${conditions.join(' AND ')} ORDER BY starts_at ASC LIMIT ?`, ...binds);
  return rows.map(mapEvent);
}

export async function listParticipants(db, eventId) {
  return (await all(db, `SELECT event_id, user_id, display_name, avatar_url, role FROM event_participants
     WHERE event_id = ? ORDER BY rowid ASC`, eventId)).map(mapPerson);
}

export async function replaceParticipants(db, eventId, participants = []) {
  await db.prepare('DELETE FROM event_participants WHERE event_id = ?').bind(eventId).run();
  const seen = new Set();
  for (const person of participants.slice(0, 100)) {
    const userId = String(person?.userId || person?.id || '').trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    await db.prepare(`INSERT INTO event_participants (event_id, user_id, display_name, avatar_url, role)
       VALUES (?, ?, ?, ?, ?)`).bind(eventId, userId,
      String(person.displayName || person.name || userId).trim().slice(0, 100), person.avatarUrl || null,
      person.role === 'optional' ? 'optional' : 'participant').run();
  }
  return listParticipants(db, eventId);
}

async function replaceBlockLeads(db, blockId, leads = []) {
  await db.prepare('DELETE FROM event_block_leads WHERE block_id = ?').bind(blockId).run();
  const seen = new Set();
  for (const lead of leads.slice(0, 20)) {
    const userId = String(lead?.userId || lead?.id || '').trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    await db.prepare('INSERT INTO event_block_leads (block_id, user_id, display_name) VALUES (?, ?, ?)')
      .bind(blockId, userId, String(lead.displayName || lead.name || userId).trim().slice(0, 100)).run();
  }
}

async function listBlockLeads(db, blockId) {
  return (await all(db, 'SELECT user_id, display_name FROM event_block_leads WHERE block_id = ? ORDER BY rowid ASC', blockId))
    .map((row) => ({ userId: row.user_id, displayName: row.display_name || row.user_id }));
}

async function replaceItemSpeakers(db, itemId, speakers = []) {
  await db.prepare('DELETE FROM event_item_speakers WHERE item_id = ?').bind(itemId).run();
  const seen = new Set();
  for (const speaker of speakers.slice(0, 20)) {
    const userId = String(speaker?.userId || speaker?.id || '').trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    await db.prepare('INSERT INTO event_item_speakers (item_id, user_id, display_name) VALUES (?, ?, ?)')
      .bind(itemId, userId, String(speaker.displayName || speaker.name || userId).trim().slice(0, 100)).run();
  }
}

async function listItemSpeakers(db, itemId) {
  return (await all(db, 'SELECT user_id, display_name FROM event_item_speakers WHERE item_id = ? ORDER BY rowid ASC', itemId))
    .map((row) => ({ userId: row.user_id, displayName: row.display_name || row.user_id }));
}

export async function createBlock(db, eventId, input) {
  const event = await loadEvent(db, eventId);
  if (!event) throw new Error('Evento no encontrado.');
  const title = String(input.title || '').trim().slice(0, 160);
  if (!title) throw new Error('El bloque necesita un título.');
  const positionRow = await db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM event_blocks WHERE event_id = ?').bind(eventId).first();
  const now = new Date().toISOString();
  const id = input.id || crypto.randomUUID();
  await db.prepare(`INSERT INTO event_blocks (id, event_id, title, description, duration_minutes, position, block_type, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, eventId, title,
      String(input.description || '').trim().slice(0, 2000) || null, cleanDuration(input.durationMinutes, 15, 8 * 60),
      Number(positionRow?.next_position || 0), normalizeEventBlockType(input.type), normalizeEventItemStatus(input.status, 'pending'), now, now).run();
  if (Array.isArray(input.leads)) await replaceBlockLeads(db, id, input.leads);
  await touchEvent(db, eventId);
  return loadBlockFull(db, id);
}

export async function updateBlock(db, blockId, fields = {}) {
  const existing = mapBlock(await db.prepare('SELECT * FROM event_blocks WHERE id = ?').bind(blockId).first());
  if (!existing) return null;
  const title = fields.title !== undefined ? String(fields.title || '').trim().slice(0, 160) : existing.title;
  if (!title) throw new Error('El bloque necesita un título.');
  const now = new Date().toISOString();
  await db.prepare(`UPDATE event_blocks SET title = ?, description = ?, duration_minutes = ?, block_type = ?, status = ?, updated_at = ? WHERE id = ?`)
    .bind(title, fields.description !== undefined ? String(fields.description || '').trim().slice(0, 2000) || null : existing.description || null,
      fields.durationMinutes !== undefined ? cleanDuration(fields.durationMinutes, existing.durationMinutes, 8 * 60) : existing.durationMinutes,
      fields.type !== undefined ? normalizeEventBlockType(fields.type, existing.type) : existing.type,
      fields.status !== undefined ? normalizeEventItemStatus(fields.status, existing.status) : existing.status, now, blockId).run();
  if (Array.isArray(fields.leads)) await replaceBlockLeads(db, blockId, fields.leads);
  await touchEvent(db, existing.eventId);
  return loadBlockFull(db, blockId);
}

export async function deleteBlock(db, blockId) {
  const existing = mapBlock(await db.prepare('SELECT * FROM event_blocks WHERE id = ?').bind(blockId).first());
  if (!existing) return null;
  await db.prepare('DELETE FROM event_blocks WHERE id = ?').bind(blockId).run();
  await normalizeBlockPositions(db, existing.eventId);
  await touchEvent(db, existing.eventId);
  return { ok: true, id: blockId, eventId: existing.eventId };
}

export async function reorderBlocks(db, eventId, ids = []) {
  for (let index = 0; index < ids.length; index += 1) {
    await db.prepare('UPDATE event_blocks SET position = ?, updated_at = ? WHERE id = ? AND event_id = ?')
      .bind(index, new Date().toISOString(), ids[index], eventId).run();
  }
  await normalizeBlockPositions(db, eventId); await touchEvent(db, eventId); return listBlocks(db, eventId);
}

async function normalizeBlockPositions(db, eventId) {
  const rows = await all(db, 'SELECT id FROM event_blocks WHERE event_id = ? ORDER BY position ASC, created_at ASC', eventId);
  for (let i = 0; i < rows.length; i += 1) await db.prepare('UPDATE event_blocks SET position = ? WHERE id = ?').bind(i, rows[i].id).run();
}

export async function listBlocks(db, eventId) {
  return (await all(db, 'SELECT * FROM event_blocks WHERE event_id = ? ORDER BY position ASC, created_at ASC', eventId)).map(mapBlock);
}

export async function createItem(db, blockId, input) {
  const block = mapBlock(await db.prepare('SELECT * FROM event_blocks WHERE id = ?').bind(blockId).first());
  if (!block) throw new Error('Bloque no encontrado.');
  const title = String(input.title || '').trim().slice(0, 200);
  if (!title) throw new Error('El punto necesita un título.');
  const positionRow = await db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM event_items WHERE block_id = ?').bind(blockId).first();
  const now = new Date().toISOString(); const id = input.id || crypto.randomUUID();
  await db.prepare(`INSERT INTO event_items (id, block_id, title, description, duration_minutes, position, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, blockId, title,
      String(input.description || '').trim().slice(0, 2400) || null, cleanDuration(input.durationMinutes, 0, 8 * 60),
      Number(positionRow?.next_position || 0), normalizeEventItemStatus(input.status), now, now).run();
  if (Array.isArray(input.speakers)) await replaceItemSpeakers(db, id, input.speakers);
  if (Array.isArray(input.links)) await replaceLinks(db, { eventId: block.eventId, blockId, itemId: id }, input.links);
  await touchEvent(db, block.eventId); return loadItemFull(db, id);
}

export async function updateItem(db, itemId, fields = {}) {
  const existing = mapItem(await db.prepare('SELECT * FROM event_items WHERE id = ?').bind(itemId).first());
  if (!existing) return null;
  const block = mapBlock(await db.prepare('SELECT * FROM event_blocks WHERE id = ?').bind(existing.blockId).first());
  const title = fields.title !== undefined ? String(fields.title || '').trim().slice(0, 200) : existing.title;
  if (!title) throw new Error('El punto necesita un título.');
  const now = new Date().toISOString();
  await db.prepare(`UPDATE event_items SET title = ?, description = ?, duration_minutes = ?, status = ?, updated_at = ? WHERE id = ?`)
    .bind(title, fields.description !== undefined ? String(fields.description || '').trim().slice(0, 2400) || null : existing.description || null,
      fields.durationMinutes !== undefined ? cleanDuration(fields.durationMinutes, existing.durationMinutes, 8 * 60) : existing.durationMinutes,
      fields.status !== undefined ? normalizeEventItemStatus(fields.status, existing.status) : existing.status, now, itemId).run();
  if (Array.isArray(fields.speakers)) await replaceItemSpeakers(db, itemId, fields.speakers);
  if (Array.isArray(fields.links) && block) await replaceLinks(db, { eventId: block.eventId, blockId: block.id, itemId }, fields.links);
  if (block) await touchEvent(db, block.eventId); return loadItemFull(db, itemId);
}

export async function deleteItem(db, itemId) {
  const existing = mapItem(await db.prepare('SELECT * FROM event_items WHERE id = ?').bind(itemId).first());
  if (!existing) return null;
  const block = mapBlock(await db.prepare('SELECT * FROM event_blocks WHERE id = ?').bind(existing.blockId).first());
  await db.prepare('DELETE FROM event_items WHERE id = ?').bind(itemId).run(); await normalizeItemPositions(db, existing.blockId);
  if (block) await touchEvent(db, block.eventId); return { ok: true, id: itemId };
}

export async function reorderItems(db, blockId, ids = []) {
  const block = mapBlock(await db.prepare('SELECT * FROM event_blocks WHERE id = ?').bind(blockId).first()); if (!block) return [];
  for (let index = 0; index < ids.length; index += 1) await db.prepare('UPDATE event_items SET position = ?, updated_at = ? WHERE id = ? AND block_id = ?').bind(index, new Date().toISOString(), ids[index], blockId).run();
  await normalizeItemPositions(db, blockId); await touchEvent(db, block.eventId); return listItems(db, blockId);
}

async function normalizeItemPositions(db, blockId) {
  const rows = await all(db, 'SELECT id FROM event_items WHERE block_id = ? ORDER BY position ASC, created_at ASC', blockId);
  for (let i = 0; i < rows.length; i += 1) await db.prepare('UPDATE event_items SET position = ? WHERE id = ?').bind(i, rows[i].id).run();
}

export async function listItems(db, blockId) {
  return (await all(db, 'SELECT * FROM event_items WHERE block_id = ? ORDER BY position ASC, created_at ASC', blockId)).map(mapItem);
}

async function replaceLinks(db, target, links = []) {
  if (target.itemId) await db.prepare('DELETE FROM event_links WHERE item_id = ?').bind(target.itemId).run();
  else if (target.blockId) await db.prepare('DELETE FROM event_links WHERE block_id = ? AND item_id IS NULL').bind(target.blockId).run();
  else await db.prepare('DELETE FROM event_links WHERE event_id = ? AND block_id IS NULL AND item_id IS NULL').bind(target.eventId).run();
  let position = 0;
  for (const link of links.slice(0, 20)) {
    const url = sanitizeLink(link?.url || link); if (!url) continue;
    await db.prepare(`INSERT INTO event_links (id, event_id, block_id, item_id, label, url, position) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), target.eventId, target.blockId || null, target.itemId || null, linkLabel(url, link?.label), url, position).run();
    position += 1;
  }
}

async function listLinks(db, { eventId, blockId, itemId }) {
  let rows;
  if (itemId) rows = await all(db, 'SELECT * FROM event_links WHERE item_id = ? ORDER BY position ASC', itemId);
  else if (blockId) rows = await all(db, 'SELECT * FROM event_links WHERE block_id = ? AND item_id IS NULL ORDER BY position ASC', blockId);
  else rows = await all(db, 'SELECT * FROM event_links WHERE event_id = ? AND block_id IS NULL AND item_id IS NULL ORDER BY position ASC', eventId);
  return rows.map(mapLink);
}

export async function addNote(db, eventId, input = {}) {
  const content = String(input.content || '').trim().slice(0, 8000); if (!content) throw new Error('La nota está vacía.');
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO event_notes (id, event_id, block_id, item_id, content, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, eventId, input.blockId || null, input.itemId || null, content, input.createdBy || 'activity', now, now).run();
  await touchEvent(db, eventId); return mapNote(await db.prepare('SELECT * FROM event_notes WHERE id = ?').bind(id).first());
}

export async function updateNote(db, noteId, content) {
  const note = mapNote(await db.prepare('SELECT * FROM event_notes WHERE id = ?').bind(noteId).first()); if (!note) return null;
  const clean = String(content || '').trim().slice(0, 8000); if (!clean) throw new Error('La nota está vacía.');
  const now = new Date().toISOString(); await db.prepare('UPDATE event_notes SET content = ?, updated_at = ? WHERE id = ?').bind(clean, now, noteId).run();
  await touchEvent(db, note.eventId); return { ...note, content: clean, updatedAt: now };
}

export async function deleteNote(db, noteId) {
  const note = mapNote(await db.prepare('SELECT * FROM event_notes WHERE id = ?').bind(noteId).first()); if (!note) return null;
  await db.prepare('DELETE FROM event_notes WHERE id = ?').bind(noteId).run(); await touchEvent(db, note.eventId); return { ok: true, id: noteId };
}

export async function addDecision(db, eventId, input = {}) {
  const content = String(input.content || '').trim().slice(0, 4000); if (!content) throw new Error('La decisión está vacía.');
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO event_decisions (id, event_id, block_id, item_id, content, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, eventId, input.blockId || null, input.itemId || null, content, input.createdBy || 'activity', now).run();
  await touchEvent(db, eventId); return mapDecision(await db.prepare('SELECT * FROM event_decisions WHERE id = ?').bind(id).first());
}

export async function deleteDecision(db, decisionId) {
  const decision = mapDecision(await db.prepare('SELECT * FROM event_decisions WHERE id = ?').bind(decisionId).first()); if (!decision) return null;
  await db.prepare('DELETE FROM event_decisions WHERE id = ?').bind(decisionId).run(); await touchEvent(db, decision.eventId); return { ok: true, id: decisionId };
}

export async function linkTaskToEvent(db, { eventId, blockId, itemId, taskId }) {
  await db.prepare(`INSERT INTO event_task_links (event_id, block_id, item_id, task_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(task_id) DO UPDATE SET event_id = excluded.event_id, block_id = excluded.block_id, item_id = excluded.item_id`)
    .bind(eventId, blockId || null, itemId || null, taskId).run(); await touchEvent(db, eventId);
}

async function loadEventTasks(db, eventId) {
  const rows = await all(db, `SELECT l.event_id, l.block_id, l.item_id, t.id, t.board_id, t.title, t.description, t.status, t.priority,
            t.assignee_id, t.assignee_name, t.labels, t.created_at, t.updated_at
     FROM event_task_links l JOIN tasks t ON t.id = l.task_id WHERE l.event_id = ? ORDER BY t.created_at ASC`, eventId);
  return rows.map((row) => ({ id: row.id, eventId: row.event_id, blockId: row.block_id || null, itemId: row.item_id || null, boardId: row.board_id,
    title: row.title, description: row.description || '', status: row.status, priority: row.priority, assigneeId: row.assignee_id || null,
    assigneeName: row.assignee_name || null, createdAt: row.created_at, updatedAt: row.updated_at }));
}

async function loadNotes(db, eventId) { return (await all(db, 'SELECT * FROM event_notes WHERE event_id = ? ORDER BY created_at ASC', eventId)).map(mapNote); }
async function loadDecisions(db, eventId) { return (await all(db, 'SELECT * FROM event_decisions WHERE event_id = ? ORDER BY created_at ASC', eventId)).map(mapDecision); }

async function loadBlockFull(db, blockId) {
  const block = mapBlock(await db.prepare('SELECT * FROM event_blocks WHERE id = ?').bind(blockId).first()); if (!block) return null;
  const [leads, items, links] = await Promise.all([listBlockLeads(db, blockId), listItems(db, blockId), listLinks(db, { eventId: block.eventId, blockId })]);
  const fullItems = []; for (const item of items) fullItems.push(await loadItemFull(db, item.id));
  return { ...block, leads, links, items: fullItems };
}

async function loadItemFull(db, itemId) {
  const item = mapItem(await db.prepare('SELECT * FROM event_items WHERE id = ?').bind(itemId).first()); if (!item) return null;
  const block = mapBlock(await db.prepare('SELECT * FROM event_blocks WHERE id = ?').bind(item.blockId).first());
  const [speakers, links] = await Promise.all([listItemSpeakers(db, itemId), listLinks(db, { eventId: block?.eventId, blockId: item.blockId, itemId })]);
  return { ...item, speakers, links };
}

export async function loadEventFull(db, eventId) {
  const event = await loadEvent(db, eventId); if (!event) return null;
  const [participants, blocks, notes, decisions, tasks, links] = await Promise.all([listParticipants(db, eventId), listBlocks(db, eventId), loadNotes(db, eventId), loadDecisions(db, eventId), loadEventTasks(db, eventId), listLinks(db, { eventId })]);
  const fullBlocks = []; for (const block of blocks) fullBlocks.push(await loadBlockFull(db, block.id));
  const notesByItem = new Map(), notesByBlock = new Map(), decisionsByItem = new Map(), decisionsByBlock = new Map(), tasksByItem = new Map(), tasksByBlock = new Map();
  for (const note of notes) { const map = note.itemId ? notesByItem : note.blockId ? notesByBlock : null; const key = note.itemId || note.blockId; if (map) { if (!map.has(key)) map.set(key, []); map.get(key).push(note); } }
  for (const decision of decisions) { const map = decision.itemId ? decisionsByItem : decision.blockId ? decisionsByBlock : null; const key = decision.itemId || decision.blockId; if (map) { if (!map.has(key)) map.set(key, []); map.get(key).push(decision); } }
  for (const task of tasks) { const map = task.itemId ? tasksByItem : task.blockId ? tasksByBlock : null; const key = task.itemId || task.blockId; if (map) { if (!map.has(key)) map.set(key, []); map.get(key).push(task); } }
  const enrichedBlocks = fullBlocks.map((block) => ({ ...block, notes: notesByBlock.get(block.id) || [], decisions: decisionsByBlock.get(block.id) || [], tasks: tasksByBlock.get(block.id) || [],
    items: (block.items || []).map((item) => ({ ...item, notes: notesByItem.get(item.id) || [], decisions: decisionsByItem.get(item.id) || [], tasks: tasksByItem.get(item.id) || [] })) }));
  return { ...event, participants, links, blocks: enrichedBlocks, notes: notes.filter((note) => !note.blockId && !note.itemId), decisions, tasks };
}

export async function setEventStatus(db, eventId, status) {
  const event = await loadEvent(db, eventId); if (!event) return null;
  const nextStatus = normalizeEventStatus(status, event.status); const now = new Date().toISOString();
  const startedAt = nextStatus === 'live' && !event.startedAt ? now : event.startedAt; const finishedAt = nextStatus === 'finished' ? now : event.finishedAt;
  await db.prepare('UPDATE events SET status = ?, started_at = ?, finished_at = ?, updated_at = ? WHERE id = ?')
    .bind(nextStatus, startedAt || null, finishedAt || null, now, eventId).run(); return loadEventFull(db, eventId);
}

export async function setMinuteDocumentId(db, eventId, documentId) {
  const now = new Date().toISOString(); await db.prepare('UPDATE events SET minute_document_id = ?, updated_at = ? WHERE id = ?').bind(documentId, now, eventId).run(); return loadEvent(db, eventId);
}

export async function duplicateEvent(db, eventId, { id, eventDate, title, createdBy, channelId } = {}) {
  const source = await loadEventFull(db, eventId); if (!source) return null;
  const clone = await createEvent(db, { id: id || crypto.randomUUID(), guildId: source.guildId, title: title || source.title, description: source.description,
    eventDate: eventDate || source.eventDate, startTime: source.startTime, timezone: source.timezone, expectedDuration: source.expectedDuration, status: 'scheduled',
    channelId: channelId !== undefined ? channelId : source.channelId, createdBy: createdBy || source.createdBy, participants: source.participants });
  for (const block of source.blocks) {
    const newBlock = await createBlock(db, clone.id, { title: block.title, description: block.description, durationMinutes: block.durationMinutes, type: block.type, leads: block.leads });
    for (const item of block.items || []) await createItem(db, newBlock.id, { title: item.title, description: item.description, durationMinutes: item.durationMinutes, speakers: item.speakers, links: item.links });
  }
  return loadEventFull(db, clone.id);
}

export async function listReminderCandidates(db, beforeIso, limit = 100) {
  return (await all(db, `SELECT * FROM events WHERE status = 'scheduled' AND starts_at IS NOT NULL AND starts_at <= ? ORDER BY starts_at ASC LIMIT ?`, beforeIso, limit)).map(mapEvent);
}
export async function hasReminderBeenSent(db, eventId, offsetMinutes) {
  const row = await db.prepare('SELECT sent_at FROM event_reminders WHERE event_id = ? AND offset_minutes = ?').bind(eventId, offsetMinutes).first(); return Boolean(row?.sent_at);
}
export async function markReminderSent(db, eventId, offsetMinutes) {
  const sentAt = new Date().toISOString(); await db.prepare(`INSERT INTO event_reminders (event_id, offset_minutes, sent_at) VALUES (?, ?, ?)
     ON CONFLICT(event_id, offset_minutes) DO UPDATE SET sent_at = excluded.sent_at`).bind(eventId, offsetMinutes, sentAt).run();
}
async function touchEvent(db, eventId) { await db.prepare('UPDATE events SET updated_at = ? WHERE id = ?').bind(new Date().toISOString(), eventId).run(); }
