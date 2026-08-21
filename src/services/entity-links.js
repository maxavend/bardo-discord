const ENTITY_TYPES = new Set(['document', 'board', 'task', 'event']);
export const ENTITY_RELATIONS = new Set(['event_has_task', 'event_has_minutes', 'task_from_document', 'task_references_document', 'document_references_event']);

function cleanType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!ENTITY_TYPES.has(type)) throw new Error('Tipo de entidad no soportado.');
  return type;
}

async function directGuild(db, type, id) {
  if (type === 'board') return (await db.prepare('SELECT guild_id FROM boards WHERE id = ? LIMIT 1').bind(id).first())?.guild_id || null;
  if (type === 'task') return (await db.prepare('SELECT b.guild_id FROM tasks t JOIN boards b ON b.id = t.board_id WHERE t.id = ? LIMIT 1').bind(id).first())?.guild_id || null;
  if (type === 'event') return (await db.prepare('SELECT guild_id FROM events WHERE id = ? LIMIT 1').bind(id).first())?.guild_id || null;
  return null;
}

export async function documentBelongsToGuild(db, documentId, guildId) {
  const row = await db.prepare(`SELECT 1 AS ok WHERE
    EXISTS (SELECT 1 FROM activity_contexts WHERE document_id = ? AND guild_id = ?)
    OR EXISTS (SELECT 1 FROM events WHERE minute_document_id = ? AND guild_id = ?)
    OR EXISTS (SELECT 1 FROM entity_links WHERE guild_id = ? AND ((source_type = 'document' AND source_id = ?) OR (target_type = 'document' AND target_id = ?)))
    LIMIT 1`)
    .bind(documentId, guildId, documentId, guildId, guildId, documentId, documentId).first();
  return Boolean(row?.ok);
}

export async function entityBelongsToGuild(db, type, id, guildId) {
  const entityType = cleanType(type);
  const entityId = String(id || '').trim();
  const guild = String(guildId || '').trim();
  if (!entityId || !guild) return false;
  if (entityType === 'document') return documentBelongsToGuild(db, entityId, guild);
  return String(await directGuild(db, entityType, entityId) || '') === guild;
}

export class EntityLinkService {
  constructor(env) { this.db = env.DB; }

  async create(input, context = {}) {
    const sourceType = cleanType(input.sourceType);
    const targetType = cleanType(input.targetType);
    const sourceId = String(input.sourceId || '').trim();
    const targetId = String(input.targetId || '').trim();
    const relationType = String(input.relationType || '').trim();
    const guildId = String(input.guildId || context.guildId || '').trim();
    const createdBy = String(input.createdBy || context.actorUserId || '').trim() || 'unknown';
    if (!sourceId || !targetId || !guildId || !ENTITY_RELATIONS.has(relationType)) throw new Error('Enlace de entidad inválido.');
    if (!await entityBelongsToGuild(this.db, sourceType, sourceId, guildId) || !await entityBelongsToGuild(this.db, targetType, targetId, guildId)) {
      throw new Error('Las entidades no pertenecen al mismo servidor.');
    }
    const now = new Date().toISOString();
    const id = input.id || crypto.randomUUID();
    await this.db.prepare(`INSERT INTO entity_links (id, guild_id, source_type, source_id, target_type, target_id, relation_type, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source_type, source_id, target_type, target_id, relation_type) DO NOTHING`)
      .bind(id, guildId, sourceType, sourceId, targetType, targetId, relationType, createdBy, now).run();
    return this.db.prepare(`SELECT * FROM entity_links WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND relation_type = ? LIMIT 1`)
      .bind(sourceType, sourceId, targetType, targetId, relationType).first();
  }

  async list(type, id, guildId) {
    const entityType = cleanType(type);
    if (!await entityBelongsToGuild(this.db, entityType, id, guildId)) throw new Error('No tienes acceso a este recurso.');
    const result = await this.db.prepare(`SELECT * FROM entity_links WHERE guild_id = ? AND ((source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)) ORDER BY created_at DESC`)
      .bind(guildId, entityType, id, entityType, id).all();
    return result.results || [];
  }

  async remove(relationType, sourceType, sourceId, targetType, targetId, guildId) {
    await this.db.prepare(`DELETE FROM entity_links WHERE guild_id = ? AND relation_type = ? AND source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?`)
      .bind(guildId, relationType, cleanType(sourceType), sourceId, cleanType(targetType), targetId).run();
  }
}
