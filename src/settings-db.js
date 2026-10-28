// Ajustes en tres niveles: servidor (guild), espacio (canal) y personal.
// NULL en un nivel significa "hereda": canal → servidor → valor por defecto.

export const DEFAULT_SETTINGS = Object.freeze({
  timeZone: 'America/Santiago',
  taskChannelNotices: true,
  taskDmNotices: true,
});

const toBool = value => (value === null || value === undefined ? null : Boolean(value));
const toInt = value => (value === null || value === undefined ? null : (value ? 1 : 0));

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', {timeZone}).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function loadGuildSettings(db, guildId) {
  const row = await db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').bind(guildId).first();
  return {
    timeZone: row?.time_zone || null,
    timeZoneDetected: Boolean(row?.time_zone_detected),
    taskChannelNotices: toBool(row?.task_channel_notices),
    taskDmNotices: toBool(row?.task_dm_notices),
  };
}

export async function loadChannelSettings(db, guildId, channelId) {
  const row = await db.prepare('SELECT * FROM channel_settings WHERE guild_id = ? AND channel_id = ?').bind(guildId, channelId).first();
  return {
    timeZone: row?.time_zone || null,
    taskChannelNotices: toBool(row?.task_channel_notices),
    taskDmNotices: toBool(row?.task_dm_notices),
  };
}

export const USER_THEMES = Object.freeze(['dark', 'light', 'system']);

export async function loadUserSettings(db, userId) {
  const row = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(userId).first();
  return {
    taskDmNotices: row ? toBool(row.task_dm_notices) ?? true : true,
    theme: USER_THEMES.includes(row?.theme) ? row.theme : null,
  };
}

/** Valores efectivos para un canal, con la fuente de cada uno. */
export function resolveSettings(server, space, defaults = DEFAULT_SETTINGS) {
  const pick = key => (space[key] !== null && space[key] !== undefined
    ? {value: space[key], source: 'space'}
    : server[key] !== null && server[key] !== undefined
      ? {value: server[key], source: 'server'}
      : {value: defaults[key], source: 'default'});
  const timeZone = pick('timeZone');
  const channel = pick('taskChannelNotices');
  const dm = pick('taskDmNotices');
  return {
    timeZone: timeZone.value,
    taskChannelNotices: channel.value,
    taskDmNotices: dm.value,
    sources: {timeZone: timeZone.source, taskChannelNotices: channel.source, taskDmNotices: dm.source},
  };
}

export async function loadEffectiveSettings(db, guildId, channelId, defaults = DEFAULT_SETTINGS) {
  if (!db || !guildId) return resolveSettings({}, {}, defaults);
  const [server, space] = await Promise.all([
    loadGuildSettings(db, guildId),
    channelId ? loadChannelSettings(db, guildId, channelId) : {},
  ]);
  return resolveSettings(server, space, defaults);
}

function mergeFields(current, fields) {
  return {
    timeZone: 'timeZone' in fields ? fields.timeZone : current.timeZone,
    taskChannelNotices: 'taskChannelNotices' in fields ? fields.taskChannelNotices : current.taskChannelNotices,
    taskDmNotices: 'taskDmNotices' in fields ? fields.taskDmNotices : current.taskDmNotices,
  };
}

export async function saveGuildSettings(db, guildId, fields, userId) {
  const current = await loadGuildSettings(db, guildId);
  const next = mergeFields(current, fields);
  // Elegirla a mano deja de ser "detectada".
  const detected = 'timeZone' in fields ? false : current.timeZoneDetected;
  await db.prepare(`INSERT INTO guild_settings (guild_id, time_zone, time_zone_detected, task_channel_notices, task_dm_notices, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET time_zone = excluded.time_zone, time_zone_detected = excluded.time_zone_detected,
      task_channel_notices = excluded.task_channel_notices, task_dm_notices = excluded.task_dm_notices,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(guildId, next.timeZone, detected ? 1 : 0, toInt(next.taskChannelNotices), toInt(next.taskDmNotices), new Date().toISOString(), userId)
    .run();
}

/** Guarda la zona horaria detectada solo si el servidor todavía no tiene una. */
export async function saveDetectedGuildTimeZone(db, guildId, timeZone, userId) {
  const result = await db.prepare(`INSERT INTO guild_settings (guild_id, time_zone, time_zone_detected, updated_at, updated_by)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET time_zone = excluded.time_zone, time_zone_detected = 1,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
    WHERE guild_settings.time_zone IS NULL`)
    .bind(guildId, timeZone, new Date().toISOString(), userId).run();
  return Number(result.meta?.changes) === 1;
}

export async function saveChannelSettings(db, guildId, channelId, fields, userId) {
  const next = mergeFields(await loadChannelSettings(db, guildId, channelId), fields);
  await db.prepare(`INSERT INTO channel_settings (guild_id, channel_id, time_zone, task_channel_notices, task_dm_notices, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, channel_id) DO UPDATE SET time_zone = excluded.time_zone,
      task_channel_notices = excluded.task_channel_notices, task_dm_notices = excluded.task_dm_notices,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(guildId, channelId, next.timeZone, toInt(next.taskChannelNotices), toInt(next.taskDmNotices), new Date().toISOString(), userId)
    .run();
}

/** Guarda solo los campos presentes; los demás quedan como estaban. */
export async function saveUserSettings(db, userId, fields) {
  const has = key => Object.prototype.hasOwnProperty.call(fields, key);
  await db.prepare(`INSERT INTO user_settings (user_id, task_dm_notices, theme, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      task_dm_notices = CASE WHEN ? THEN excluded.task_dm_notices ELSE user_settings.task_dm_notices END,
      theme = CASE WHEN ? THEN excluded.theme ELSE user_settings.theme END,
      updated_at = excluded.updated_at`)
    .bind(userId, has('taskDmNotices') ? toInt(fields.taskDmNotices) : null, has('theme') ? fields.theme : null,
      new Date().toISOString(), has('taskDmNotices') ? 1 : 0, has('theme') ? 1 : 0)
    .run();
}
