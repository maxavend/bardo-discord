export const BARDO_HOME_PREFIX = 'bardo:home:';

export function homeTarget(guildId) {
  const id = String(guildId || '').trim();
  return id ? `${BARDO_HOME_PREFIX}${id}` : null;
}

export function parseHomeTarget(value) {
  const text = String(value || '').trim();
  if (!text.startsWith(BARDO_HOME_PREFIX)) return null;
  const guildId = text.slice(BARDO_HOME_PREFIX.length).trim();
  return /^\d{17,20}$/.test(guildId) ? guildId : null;
}
