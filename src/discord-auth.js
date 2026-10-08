import {
  deleteDocsSession,
  deleteExpiredDocsSessions,
  loadDocsSession,
  saveDocsSession,
} from './db.js';
import {
  canUserViewChannel,
  discordUnavailableResponse,
  isDiscordUnavailableError,
} from './discord-permissions.js';

const AUTH_TOKEN_PATH = '/api/auth/token';
const DISCORD_CLIENT_ID = '1539704001535156254';
// Keep the Activity session long-lived. Access is still checked against the
// current Discord guild/channel permissions on every Docs request.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function bytesToHex(bytes) {
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

function newSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function discordJson(path, accessToken) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Discord API ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function exchangeCode(code, env) {
  if (!env.DISCORD_CLIENT_SECRET) {
    const error = new Error('DISCORD_CLIENT_SECRET is not configured');
    error.code = 'missing_client_secret';
    throw error;
  }

  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const error = new Error(`Discord OAuth ${response.status}`);
    error.code = 'oauth_exchange_failed';
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function createAuthenticatedSession(code, guildId, channelId, env) {
  if (!env.DB) throw new Error('Database unavailable');
  if (!guildId) {
    const error = new Error('Guild context required');
    error.code = 'guild_required';
    throw error;
  }

  const oauth = await exchangeCode(code, env);
  const [user, guilds] = await Promise.all([
    discordJson('/users/@me', oauth.access_token),
    discordJson('/users/@me/guilds', oauth.access_token),
  ]);

  if (!Array.isArray(guilds) || !guilds.some(guild => guild?.id === guildId)) {
    const error = new Error('Discord user is not a member of this guild');
    error.code = 'guild_membership_required';
    throw error;
  }

  if (!channelId || !(await canUserViewChannel(env, guildId, user.id, channelId))) {
    const error = new Error('Discord user cannot view this channel');
    error.code = 'channel_access_required';
    throw error;
  }

  const token = newSessionToken();
  const tokenHash = await hashToken(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);

  await deleteExpiredDocsSessions(env.DB, createdAt.toISOString());
  await saveDocsSession(env.DB, tokenHash, {
    userId: user.id,
    guildId,
    channelId,
    username: user.global_name || user.username || null,
    avatar: user.avatar || null,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return {
    accessToken: oauth.access_token,
    token,
    expiresAt: expiresAt.toISOString(),
    user,
    guildId,
    channelId,
  };
}

/** API error for the Docs/Planner APIs: `{error: <código>, message: <español>}`. */
function apiError(status, code, message) {
  return json({ error: code, message }, status);
}

/**
 * Error of the token endpoint. The Activity shows `error` to the person as-is,
 * so here it carries the Spanish message (the stable code is in `code`).
 */
function authError(status, code, message) {
  return json({ error: message, code, message }, status);
}

const SESSION_EXPIRED_MESSAGE = 'Tu sesión de Bardo expiró. Cierra y vuelve a abrir la actividad para continuar.';

export async function requireDocsSession(request, env) {
  if (!env.DB) return { error: apiError(503, 'database_unavailable', 'La base de datos de Bardo no está disponible. Inténtalo de nuevo en unos minutos.') };
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: apiError(401, 'auth_required', 'Abre Bardo desde Discord para iniciar sesión.') };

  const rawToken = match[1].trim();
  if (!rawToken) return { error: apiError(401, 'auth_required', 'Abre Bardo desde Discord para iniciar sesión.') };

  const tokenHash = await hashToken(rawToken);
  const session = await loadDocsSession(env.DB, tokenHash);
  if (!session) return { error: apiError(401, 'session_not_found', SESSION_EXPIRED_MESSAGE) };

  if (Date.parse(session.expiresAt) <= Date.now()) {
    await deleteDocsSession(env.DB, tokenHash);
    return { error: apiError(401, 'session_expired', SESSION_EXPIRED_MESSAGE) };
  }

  return { session, tokenHash };
}

export async function handleDiscordAuthApi(request, url, env) {
  if (url.pathname !== AUTH_TOKEN_PATH) return null;
  if (request.method !== 'POST') return authError(405, 'method_not_allowed', 'Método no permitido.');

  let payload;
  try {
    payload = await request.json();
  } catch {
    return authError(400, 'invalid_json', 'La solicitud de inicio de sesión no es válida. Vuelve a abrir Bardo.');
  }

  const code = typeof payload?.code === 'string' ? payload.code.trim() : '';
  const guildId = typeof payload?.guildId === 'string' ? payload.guildId.trim() : '';
  const channelId = typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
  if (!code) return authError(400, 'code_required', 'Discord no entregó la autorización. Vuelve a abrir Bardo y acepta el permiso.');
  if (!guildId) return authError(400, 'guild_required', 'Abre Bardo dentro de un servidor de Discord.');
  if (!channelId) return authError(400, 'channel_required', 'Abre Bardo desde un canal de Discord.');

  try {
    const auth = await createAuthenticatedSession(code, guildId, channelId, env);
    return json({
      access_token: auth.accessToken,
      bardo_token: auth.token,
      expires_at: auth.expiresAt,
      guild_id: auth.guildId,
      channel_id: auth.channelId,
      user: {
        id: auth.user.id,
        username: auth.user.username,
        global_name: auth.user.global_name || null,
        avatar: auth.user.avatar || null,
      },
    });
  } catch (error) {
    console.error('Bardo Docs Discord auth failed:', error?.code || error?.message || error);
    if (error?.code === 'missing_client_secret') {
      return authError(503, 'oauth_not_configured', 'El inicio de sesión con Discord no está configurado en Bardo. Avisa a quien administra el bot.');
    }
    if (error?.code === 'guild_membership_required') {
      return authError(403, 'not_member', 'No eres miembro de este servidor de Discord.');
    }
    if (error?.code === 'guild_required') {
      return authError(400, 'guild_required', 'Abre Bardo dentro de un servidor de Discord.');
    }
    if (error?.code === 'channel_access_required') {
      return authError(403, 'channel_forbidden', 'No tienes acceso a este canal de Discord.');
    }
    if (isDiscordUnavailableError(error)) {
      // Discord rate-limited or failed while checking channel access: this is
      // retryable, not an authentication failure.
      return discordUnavailableResponse(error);
    }
    return authError(401, 'auth_failed', 'No pudimos iniciar sesión con Discord. Cierra y vuelve a abrir Bardo.');
  }
}

export { DISCORD_CLIENT_ID };
