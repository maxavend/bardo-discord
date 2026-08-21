const SAFE_FIELDS = new Set([
  'event', 'requestId', 'route', 'status', 'durationMs', 'guildHash', 'entityType', 'errorCode',
  'environment', 'notificationType', 'deliveryStatus', 'lagMs', 'count', 'cron',
]);

function cleanToken(value, max = 80) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, max) || null;
}

export function observableRoute(pathname) {
  const path = String(pathname || '/');
  const patterns = [
    [/^\/api\/auth\/token$/, '/api/auth/token', 'auth'],
    [/^\/api\/documents\/[^/]+\/export$/, '/api/documents/:id/export', 'document'],
    [/^\/api\/documents\/[^/]+\/history(?:\/[^/]+\/restore)?$/, '/api/documents/:id/history', 'document'],
    [/^\/api\/documents\/[^/]+$/, '/api/documents/:id', 'document'],
    [/^\/api\/boards\/[^/]+\/(?:guild-members|guild-roles)$/, '/api/boards/:id/directory', 'board'],
    [/^\/api\/boards\/[^/]+$/, '/api/boards/:id', 'board'],
    [/^\/api\/tasks\/[^/]+$/, '/api/tasks/:id', 'task'],
    [/^\/api\/events\/[^/]+(?:\/.*)?$/, '/api/events/:id', 'event'],
    [/^\/api\/events$/, '/api/events', 'event'],
    [/^\/api\/member-directory$/, '/api/member-directory', 'member'],
    [/^\/api\/home\/[^/]+$/, '/api/home/:section', 'home'],
    [/^\/api\/navigation$/, '/api/navigation', 'navigation'],
    [/^\/api\/activity-context\/[^/]+$/, '/api/activity-context/:id', 'context'],
  ];
  for (const [matcher, route, entityType] of patterns) if (matcher.test(path)) return { route, entityType };
  if (path.startsWith('/api/')) return { route: '/api/other', entityType: 'api' };
  return { route: 'asset-or-page', entityType: 'asset' };
}

export function requestIdFor(request) {
  const candidate = request?.headers?.get?.('cf-ray') || request?.headers?.get?.('x-request-id');
  return cleanToken(candidate, 96) || crypto.randomUUID();
}

export async function hashGuildId(guildId, env = {}) {
  const salt = String(env.BARDO_LOG_HASH_SALT || '').trim();
  const value = String(guildId || '').trim();
  if (!salt || !value) return null;
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function errorCode(error) {
  const explicit = cleanToken(error?.code || error?.name, 64);
  if (explicit) return explicit;
  const message = String(error?.message || error || '');
  if (/d1|sqlite|database/i.test(message)) return 'D1_FAILURE';
  return 'UNEXPECTED_ERROR';
}

export async function emitStructuredLog(event, fields = {}, env = {}, level = 'log') {
  const record = { event: cleanToken(event, 80), environment: cleanToken(env.ENVIRONMENT || 'local', 32) };
  for (const [key, value] of Object.entries(fields)) {
    if (!SAFE_FIELDS.has(key) || value === null || value === undefined || value === '') continue;
    if (key === 'status' || key === 'durationMs' || key === 'lagMs' || key === 'count') record[key] = Number(value);
    else record[key] = cleanToken(value, key === 'route' ? 120 : 96);
  }
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  method(JSON.stringify(record));
  return record;
}

export async function requestLogFields(request, env, requestId, response, startedAt) {
  const url = new URL(request.url);
  const descriptor = observableRoute(url.pathname);
  return {
    requestId,
    route: descriptor.route,
    entityType: descriptor.entityType,
    status: response.status,
    durationMs: Math.max(0, Date.now() - startedAt),
    guildHash: await hashGuildId(request.headers.get('x-bardo-guild-id'), env),
  };
}
