// API exclusiva de la web (cookie + mismo origen): sesión, selector de canales,
// tokens por canal y conexiones de IA. Las APIs de contenido no cambian: reciben
// el mismo Bearer por canal que usa la Activity.
import {enforceUserRateLimit} from './request-security.js';
import {discordUnavailableResponse, isDiscordUnavailableError} from './discord-permissions.js';
import {handleChannelContent, handleChannelSession, principalUser} from './channel-access.js';
import {
  isSameOriginMutation,
  isWebRequest,
  logoutWebSession,
  readWebSession,
  webError,
  webJson,
} from './web-auth.js';
import {listUserChannels} from './web-channels.js';
import {listMcpGrantsForUser, revokeMcpGrantForUser} from './web-db.js';

const PREFIX = '/api/web/';
const CONNECTIONS_PATH = /^connections\/([\w-]{1,64})$/;
// Los tokens de canal viven en memoria y salen de nuevo en cada carga de página.
const CHANNEL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const webUser = principalUser;

const methodNotAllowed = () => webError(405, 'method_not_allowed', 'Esta acción no está disponible.');
const signInRequired = () => webError(401, 'auth_required', 'Inicia sesión con Discord para continuar.');
const crossOrigin = () => webError(403, 'cross_origin', 'Esta solicitud no viene de Bardo.');

async function handleConnections(request, env, session, grantId) {
  const now = new Date().toISOString();
  if (!grantId) {
    if (request.method !== 'GET') return methodNotAllowed();
    const grants = await listMcpGrantsForUser(env.DB, session.userId, now);
    return webJson({
      connections: grants.map(grant => ({
        id: grant.id,
        clientName: grant.clientName,
        firstParty: grant.firstParty,
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
  if (session) {
    const limited = await enforceUserRateLimit(env, session.userId);
    if (limited) return limited;
  }

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
  if (path === 'channel-content') {
    if (request.method !== 'GET') return methodNotAllowed();
    return handleChannelContent(url, env, session);
  }
  if (path === 'channel-session') {
    if (request.method !== 'POST') return methodNotAllowed();
    if (!isSameOriginMutation(request, env)) return crossOrigin();
    return handleChannelSession(request, env, session, {ttlMs: CHANNEL_TOKEN_TTL_MS, link: {webSessionHash: session.tokenHash}});
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
