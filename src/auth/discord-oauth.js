import { loadActivityContext, updateActivityContextAuthorization } from '../db.js';
import { createActivitySessionToken } from './session-token.js';
import { readActivityInstanceId } from './activity-access.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function oauthError(status = 401) {
  return jsonResponse({ error: 'Activity authorization required' }, status);
}

export async function handleDiscordOAuthExchange(request, env, fetchImpl = fetch) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!env?.DB || !env.DISCORD_APPLICATION_ID || !env.DISCORD_CLIENT_SECRET) {
    return oauthError(503);
  }

  const instanceId = readActivityInstanceId(request);
  if (!instanceId) return oauthError(401);
  const context = await loadActivityContext(env.DB, instanceId);
  if (!context) return oauthError(401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return oauthError(400);
  }
  const code = typeof payload?.code === 'string' ? payload.code.trim() : '';
  if (!code || code.length > 2048) return oauthError(400);

  const body = new URLSearchParams({
    client_id: env.DISCORD_APPLICATION_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
  });

  const tokenResponse = await fetchImpl('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).catch(() => null);
  if (!tokenResponse?.ok) return oauthError(401);

  const tokenData = await tokenResponse.json().catch(() => null);
  const accessToken = tokenData?.access_token;
  if (!accessToken) return oauthError(401);

  const authResponse = await fetchImpl('https://discord.com/api/oauth2/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (!authResponse?.ok) return oauthError(401);

  const authData = await authResponse.json().catch(() => null);
  const userId = authData?.user?.id;
  const applicationId = authData?.application?.id;
  const scopes = Array.isArray(authData?.scopes)
    ? authData.scopes
    : String(tokenData?.scope || '').split(/\s+/).filter(Boolean);

  if (!userId || applicationId !== env.DISCORD_APPLICATION_ID || !scopes.includes('identify')) {
    return oauthError(403);
  }

  const requestedGuildId = request.headers.get('x-bardo-guild-id')?.trim() || null;
  if (requestedGuildId && !/^\d{17,20}$/.test(requestedGuildId)) return oauthError(400);

  const expiresIn = Math.max(60, Math.min(3600, Number(tokenData?.expires_in) || 3600));
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await updateActivityContextAuthorization(env.DB, instanceId, {
    guildId: requestedGuildId,
    expiresAt,
  });

  const sessionToken = await createActivitySessionToken({
    secret: env.DISCORD_CLIENT_SECRET,
    instanceId,
    userId,
    guildId: requestedGuildId,
    scopes,
    expiresInSeconds: expiresIn,
  });

  return jsonResponse({
    access_token: accessToken,
    token_type: tokenData?.token_type || 'Bearer',
    expires_in: expiresIn,
    scope: scopes.join(' '),
    session_token: sessionToken,
  });
}
