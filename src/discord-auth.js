import {
  deleteDocsSession,
  deleteExpiredDocsSessions,
  loadDocsSession,
  saveDocsSession,
} from './db.js';
import {canUserViewChannel} from './discord-permissions.js';

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

export async function requireDocsSession(request, env) {
  if (!env.DB) return { error: json({ error: 'Database unavailable' }, 503) };
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: json({ error: 'Discord authentication required' }, 401) };

  const rawToken = match[1].trim();
  if (!rawToken) return { error: json({ error: 'Discord authentication required' }, 401) };

  const tokenHash = await hashToken(rawToken);
  const session = await loadDocsSession(env.DB, tokenHash);
  if (!session) return { error: json({ error: 'Session not recognized' }, 401) };

  if (Date.parse(session.expiresAt) <= Date.now()) {
    await deleteDocsSession(env.DB, tokenHash);
    return { error: json({ error: 'Session expired' }, 401) };
  }

  return { session, tokenHash };
}

export async function handleDiscordAuthApi(request, url, env) {
  if (url.pathname !== AUTH_TOKEN_PATH) return null;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400);
  }

  const code = typeof payload?.code === 'string' ? payload.code.trim() : '';
  const guildId = typeof payload?.guildId === 'string' ? payload.guildId.trim() : '';
  const channelId = typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
  if (!code) return json({ error: 'Discord authorization code required' }, 400);
  if (!guildId) return json({ error: 'Discord guild required' }, 400);
  if (!channelId) return json({ error: 'Discord channel required' }, 400);

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
      return json({ error: 'Discord OAuth is not configured on Bardo' }, 503);
    }
    if (error?.code === 'guild_membership_required') {
      return json({ error: 'You are not a member of this Discord server' }, 403);
    }
    if (error?.code === 'guild_required') {
      return json({ error: 'Open Bardo Docs from a Discord server' }, 400);
    }
    if (error?.code === 'channel_access_required') {
      return json({ error: 'You cannot view this Discord channel' }, 403);
    }
    return json({ error: 'Discord authentication failed' }, 401);
  }
}

export { DISCORD_CLIENT_ID };
