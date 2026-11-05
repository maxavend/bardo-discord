// API exclusiva de la web (cookie + mismo origen): sesión, selector de canales,
// tokens por canal y conexiones de IA. Las APIs de contenido no cambian: reciben
// el mismo Bearer por canal que usa la Activity.
import {mintChannelSession} from './discord-auth.js';
import {canUserViewChannel, discordUnavailableResponse, isDiscordUnavailableError} from './discord-permissions.js';
import {
  isSameOriginMutation,
  isWebRequest,
  logoutWebSession,
  overRateLimit,
  readWebSession,
  webError,
  webJson,
} from './web-auth.js';
import {listUserChannels} from './web-channels.js';
import {listMcpGrantsForUser, revokeMcpGrantForUser} from './web-db.js';

const PREFIX = '/api/web/';
// Ids de Discord (y los de los fixtures de prueba): nunca llegan sin codificar a una URL.
const ID_PATTERN = /^[\w-]{1,64}$/;
const CONNECTIONS_PATH = /^connections\/([\w-]{1,64})$/;
// Los tokens de canal viven en memoria y salen de nuevo en cada carga de página.
const CHANNEL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Cada apertura consulta a Discord sin caché, y el límite del bot es compartido.
const CHANNEL_OPENS_PER_MINUTE = 30;

function webUser(session) {
  return {
    id: session.userId,
    username: session.username,
    global_name: session.username,
    avatar: session.avatar,
  };
}

const methodNotAllowed = () => webError(405, 'method_not_allowed', 'Esta acción no está disponible.');
const signInRequired = () => webError(401, 'auth_required', 'Inicia sesión con Discord para continuar.');
const crossOrigin = () => webError(403, 'cross_origin', 'Esta solicitud no viene de Bardo.');

async function handleChannelSession(request, env, session) {
  if (overRateLimit(`channel-session:${session.userId}`, CHANNEL_OPENS_PER_MINUTE)) {
    return webError(429, 'rate_limited', 'Abriste muchos canales seguidos. Espera un minuto y vuelve a intentarlo.');
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return webError(400, 'invalid_json', 'No pudimos leer la solicitud. Inténtalo de nuevo.');
  }
  const guildId = typeof payload?.guildId === 'string' ? payload.guildId.trim() : '';
  const channelId = typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
  if (!ID_PATTERN.test(guildId) || !ID_PATTERN.test(channelId)) {
    return webError(400, 'invalid_channel', 'Ese canal no es válido. Elige otro.');
  }
  // Sin caché: abrir un canal siempre refleja los permisos actuales de Discord.
  const canView = await canUserViewChannel({...env, DISCORD_PERMISSION_CACHE_TTL_MS: 0}, guildId, session.userId, channelId);
  if (!canView) return webError(403, 'channel_forbidden', 'No tienes acceso a este canal de Discord.');

  const webExpiry = Date.parse(session.expiresAt);
  const expiresAt = new Date(Math.min(webExpiry, Date.now() + CHANNEL_TOKEN_TTL_MS)).toISOString();
  const {token} = await mintChannelSession(env, {
    userId: session.userId,
    username: session.username,
    avatar: session.avatar,
    guildId,
    channelId,
    expiresAt,
    webSessionHash: session.tokenHash,
  });
  return webJson({bardo_token: token, expires_at: expiresAt, guild_id: guildId, channel_id: channelId, user: webUser(session)});
}

async function handleConnections(request, env, session, grantId) {
  const now = new Date().toISOString();
  if (!grantId) {
    if (request.method !== 'GET') return methodNotAllowed();
    const grants = await listMcpGrantsForUser(env.DB, session.userId, now);
    return webJson({
      connections: grants.map(grant => ({
        id: grant.id,
        clientName: grant.clientName,
        scopes: grant.scope.split(' ').filter(Boolean),
        createdAt: grant.createdAt,
        lastUsedAt: grant.lastUsedAt,
      })),
    });
  }
  if (request.method !== 'DELETE') return methodNotAllowed();
  if (!isSameOriginMutation(request, env)) return crossOrigin();
  if (!(await revokeMcpGrantForUser(env.DB, grantId, session.userId, now))) {
    return webError(404, 'not_found', 'Esta conexión ya no existe.');
  }
  return webJson({ok: true});
}

async function routeWebApi(request, url, env) {
  const path = url.pathname.slice(PREFIX.length);

  if (path === 'logout') {
    if (request.method !== 'POST') return methodNotAllowed();
    if (!isSameOriginMutation(request, env)) return crossOrigin();
    return webJson({ok: true}, 200, [await logoutWebSession(request, env)]);
  }

  const session = await readWebSession(request, env);

  // No haber entrado es un estado normal de la web, no un error.
  if (path === 'session') {
    if (request.method !== 'GET') return methodNotAllowed();
    return webJson(session ? {user: webUser(session), expiresAt: session.expiresAt} : {user: null});
  }

  if (!session) return signInRequired();
  if (path === 'channels') {
    if (request.method !== 'GET') return methodNotAllowed();
    return webJson(await listUserChannels(env, session.userId));
  }
  if (path === 'channel-session') {
    if (request.method !== 'POST') return methodNotAllowed();
    if (!isSameOriginMutation(request, env)) return crossOrigin();
    return handleChannelSession(request, env, session);
  }
  if (path === 'connections') return handleConnections(request, env, session, null);
  const connection = path.match(CONNECTIONS_PATH);
  if (connection) return handleConnections(request, env, session, connection[1]);

  return webError(404, 'not_found', 'Esta dirección no existe.');
}

/** Devuelve null si la ruta no es suya. Con la web apagada responde 404 (el cliente queda en modo local). */
export async function handleWebApi(request, url, env) {
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (!isWebRequest(url, env) || !env.DB) return webError(404, 'web_disabled', 'El acceso web a Bardo no está activo.');
  try {
    return await routeWebApi(request, url, env);
  } catch (error) {
    if (isDiscordUnavailableError(error)) return discordUnavailableResponse(error);
    throw error;
  }
}
