const NOTIFICATION_TYPES = new Set([
  'task.assigned', 'task.reassigned', 'task.due_soon',
  'event.invited', 'event.updated', 'event.cancelled', 'event.reminder', 'event.minutes_ready',
]);

export function normalizeNotificationType(value) {
  const type = String(value || '').trim();
  if (!NOTIFICATION_TYPES.has(type)) throw new Error(`Tipo de notificación no soportado: ${type || 'vacío'}`);
  return type;
}

export async function getNotificationPreference(db, guildId, userId, eventType) {
  const type = normalizeNotificationType(eventType);
  const row = await db.prepare(`SELECT guild_id, user_id, event_type, dm_enabled, reminder_offset_minutes, updated_at
    FROM notification_preferences WHERE guild_id = ? AND user_id = ? AND event_type = ?`)
    .bind(String(guildId), String(userId), type).first();
  return row ? {
    guildId: row.guild_id,
    userId: row.user_id,
    eventType: row.event_type,
    dmEnabled: Boolean(row.dm_enabled),
    reminderOffsetMinutes: row.reminder_offset_minutes === null ? null : Number(row.reminder_offset_minutes),
    updatedAt: row.updated_at,
  } : {
    guildId: String(guildId), userId: String(userId), eventType: type,
    dmEnabled: true, reminderOffsetMinutes: null, updatedAt: null,
  };
}

export async function listNotificationPreferences(db, guildId, userId) {
  const result = await db.prepare(`SELECT guild_id, user_id, event_type, dm_enabled, reminder_offset_minutes, updated_at
    FROM notification_preferences WHERE guild_id = ? AND user_id = ? ORDER BY event_type ASC`)
    .bind(String(guildId), String(userId)).all();
  return (result.results || []).map((row) => ({
    guildId: row.guild_id, userId: row.user_id, eventType: row.event_type,
    dmEnabled: Boolean(row.dm_enabled), reminderOffsetMinutes: row.reminder_offset_minutes === null ? null : Number(row.reminder_offset_minutes),
    updatedAt: row.updated_at,
  }));
}

export async function setNotificationPreference(db, { guildId, userId, eventType, dmEnabled = true, reminderOffsetMinutes = null }) {
  const type = normalizeNotificationType(eventType);
  const now = new Date().toISOString();
  const offset = reminderOffsetMinutes === null || reminderOffsetMinutes === undefined
    ? null
    : Math.max(0, Math.min(7 * 24 * 60, Math.round(Number(reminderOffsetMinutes) || 0)));
  await db.prepare(`INSERT INTO notification_preferences (guild_id, user_id, event_type, dm_enabled, reminder_offset_minutes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, event_type) DO UPDATE SET
      dm_enabled = excluded.dm_enabled,
      reminder_offset_minutes = excluded.reminder_offset_minutes,
      updated_at = excluded.updated_at`)
    .bind(String(guildId), String(userId), type, dmEnabled ? 1 : 0, offset, now).run();
  return getNotificationPreference(db, guildId, userId, type);
}

export async function createNotificationDelivery(db, input) {
  const now = new Date().toISOString();
  const id = input.id || crypto.randomUUID();
  const eventType = normalizeNotificationType(input.eventType);
  const scheduledFor = input.scheduledFor || now;
  const result = await db.prepare(`INSERT OR IGNORE INTO notification_deliveries (
      id, dedupe_key, guild_id, user_id, event_type, entity_type, entity_id, actor_user_id,
      status, attempts, scheduled_for, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`)
    .bind(id, String(input.dedupeKey), String(input.guildId), String(input.userId), eventType,
      String(input.entityType), String(input.entityId), input.actorUserId ? String(input.actorUserId) : null,
      scheduledFor, now, now).run();
  const row = await db.prepare('SELECT * FROM notification_deliveries WHERE dedupe_key = ?').bind(String(input.dedupeKey)).first();
  return { delivery: mapDelivery(row), created: Number(result.meta?.changes || 0) > 0 };
}

function mapDelivery(row) {
  if (!row) return null;
  return {
    id: row.id, dedupeKey: row.dedupe_key, guildId: row.guild_id, userId: row.user_id,
    eventType: row.event_type, entityType: row.entity_type, entityId: row.entity_id,
    actorUserId: row.actor_user_id || null, status: row.status, attempts: Number(row.attempts || 0),
    lastErrorCode: row.last_error_code || null, scheduledFor: row.scheduled_for, sentAt: row.sent_at || null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function claimNotificationDelivery(db, id) {
  const now = new Date().toISOString();
  const result = await db.prepare(`UPDATE notification_deliveries
    SET status = 'sending', attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND status IN ('pending', 'failed') AND scheduled_for <= ?`)
    .bind(now, String(id), now).run();
  if (Number(result.meta?.changes || 0) < 1) return null;
  return mapDelivery(await db.prepare('SELECT * FROM notification_deliveries WHERE id = ?').bind(String(id)).first());
}

export async function markNotificationSent(db, id) {
  const now = new Date().toISOString();
  await db.prepare(`UPDATE notification_deliveries SET status = 'sent', sent_at = ?, last_error_code = NULL, updated_at = ? WHERE id = ?`)
    .bind(now, now, String(id)).run();
}

export async function markNotificationSkipped(db, id, errorCode) {
  const now = new Date().toISOString();
  await db.prepare(`UPDATE notification_deliveries SET status = 'skipped', last_error_code = ?, updated_at = ? WHERE id = ?`)
    .bind(String(errorCode || 'SKIPPED'), now, String(id)).run();
}

export async function markNotificationFailed(db, id, errorCode, retryAt = null) {
  const now = new Date().toISOString();
  await db.prepare(`UPDATE notification_deliveries SET status = 'failed', last_error_code = ?, scheduled_for = COALESCE(?, scheduled_for), updated_at = ? WHERE id = ?`)
    .bind(String(errorCode || 'DELIVERY_FAILED'), retryAt, now, String(id)).run();
}

export async function listDueNotificationDeliveries(db, nowIso = new Date().toISOString(), limit = 50) {
  const result = await db.prepare(`SELECT * FROM notification_deliveries
    WHERE status IN ('pending', 'failed') AND scheduled_for <= ? AND attempts < 4
    ORDER BY scheduled_for ASC LIMIT ?`)
    .bind(nowIso, Math.max(1, Math.min(100, Number(limit) || 50))).all();
  return (result.results || []).map(mapDelivery);
}
