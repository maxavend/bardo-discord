// API de las apps de Bardo (escritorio). Equivale a /api/web/* pero sin cookie:
// la app presenta un token de acceso OAuth de primera parte con el permiso
// bardo:app. Las APIs de contenido no cambian: reciben el token de cada canal.
import {authenticateMcpRequest, SCOPE_APP} from './mcp-oauth.js';
import {enforceUserRateLimit} from './request-security.js';
import {discordUnavailableResponse, isDiscordUnavailableError} from './discord-permissions.js';
import {handleChannelContent, handleChannelSession, principalUser} from './channel-access.js';
import {isWebRequest, webError, webJson} from './web-auth.js';
import {listUserChannels} from './web-channels.js';

const PREFIX = '/api/app/';
// La app pide uno nuevo al abrir el canal y cuando caduca; vive solo en memoria.
const CHANNEL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
// Versión mínima de la app que entiende esta API. Se sube si cambia el contrato.
const DEFAULT_MIN_DESKTOP_VERSION = '0.1.0';

const methodNotAllowed = () => webError(405, 'method_not_allowed', 'Esta acción no está disponible.');

function versionInfo(env) {
  return {
    api: 1,
    minDesktopVersion: String(env.DESKTOP_MIN_VERSION || DEFAULT_MIN_DESKTOP_VERSION),
    latestDesktopVersion: env.DESKTOP_LATEST_VERSION ? String(env.DESKTOP_LATEST_VERSION) : null,
  };
}

/** Persona detrás del token, solo si es de una app de Bardo con bardo:app. */
async function appPrincipal(request, env) {
  const grant = await authenticateMcpRequest(request, env);
  if (!grant) return {error: webError(401, 'auth_required', 'Tu sesión terminó. Vuelve a iniciar sesión con Discord.')};
  const scopes = grant.scope.split(' ');
  if (!grant.firstParty || !scopes.includes(SCOPE_APP)) {
    return {error: webError(403, 'not_first_party', 'Este acceso es solo para las apps de Bardo.')};
  }
  return {
    principal: {
      userId: grant.userId,
      username: grant.username,
      avatar: grant.avatar,
      expiresAt: grant.expiresAt,
      grantId: grant.id,
      scopes,
    },
  };
}

async function routeAppApi(request, url, env) {
  const path = url.pathname.slice(PREFIX.length);

  // Pública: la app la consulta antes de iniciar sesión para saber si debe actualizarse.
  if (path === 'version') {
    if (request.method !== 'GET') return methodNotAllowed();
    return webJson(versionInfo(env));
  }

  const {principal, error} = await appPrincipal(request, env);
  if (error) return error;
  const limited = await enforceUserRateLimit(env, principal.userId);
  if (limited) return limited;

  if (path === 'me') {
    if (request.method !== 'GET') return methodNotAllowed();
    return webJson({user: principalUser(principal), expiresAt: principal.expiresAt, scopes: principal.scopes});
  }
  if (path === 'channels') {
    if (request.method !== 'GET') return methodNotAllowed();
    return webJson(await listUserChannels(env, principal.userId));
  }
  if (path === 'channel-content') {
    if (request.method !== 'GET') return methodNotAllowed();
    return handleChannelContent(url, env, principal);
  }
  if (path === 'channel-session') {
    if (request.method !== 'POST') return methodNotAllowed();
    // Bearer y no cookie: no hay CSRF que comprobar.
    return handleChannelSession(request, env, principal, {
      ttlMs: CHANNEL_TOKEN_TTL_MS,
      link: {appGrantId: principal.grantId},
    });
  }
  return webError(404, 'not_found', 'Esta dirección no existe.');
}

/** Devuelve null si la ruta no es suya. Con la web apagada responde 404. */
export async function handleAppApi(request, url, env) {
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (!isWebRequest(url, env) || !env.DB) return webError(404, 'web_disabled', 'El acceso a Bardo fuera de Discord no está activo.');
  try {
    return await routeAppApi(request, url, env);
  } catch (error) {
    if (isDiscordUnavailableError(error)) return discordUnavailableResponse(error);
    throw error;
  }
}
