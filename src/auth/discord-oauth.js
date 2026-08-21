import { loadActivityContext, loadDocument, updateActivityContextAuthorization } from '../db.js';
import { loadBoard } from '../kanban-db.js';
import { loadEvent } from '../event-db.js';
import { parseBoardTarget } from '../kanban.js';
import { parseEventTarget } from '../event.js';
import { parseHomeTarget } from '../home-target.js';
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

async function verifyGuildMember(fetchImpl, env, guildId, userId) {
  if (!guildId || !userId || !env.DISCORD_TOKEN) return false;
  const response = await fetchImpl(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
  }).catch(() => null);
  return Boolean(response?.ok);
}

async function resolveServerAuthorization(fetchImpl, env, context, userId, requestedGuildId = null) {
  const homeGuildId = parseHomeTarget(context.documentId);
  if (homeGuildId) {
    if (requestedGuildId && requestedGuildId !== homeGuildId) return null;
    return await verifyGuildMember(fetchImpl, env, homeGuildId, userId) ? { guildId: homeGuildId } : null;
  }

  const boardId = parseBoardTarget(context.documentId);
  if (boardId) {
    const board = await loadBoard(env.DB, boardId);
    if (!board?.guildId || (requestedGuildId && requestedGuildId !== String(board.guildId))) return null;
    const member = await verifyGuildMember(fetchImpl, env, board.guildId, userId);
    return member ? { guildId: board.guildId } : null;
  }

  const eventId = parseEventTarget(context.documentId);
  if (eventId) {
    const event = await loadEvent(env.DB, eventId);
    if (!event?.guildId || (requestedGuildId && requestedGuildId !== String(event.guildId))) return null;
    const member = await verifyGuildMember(fetchImpl, env, event.guildId, userId);
    return member ? { guildId: event.guildId } : null;
  }

  const document = await loadDocument(env.DB, context.documentId);
  if (!document) return null;

  // Event minutes have an authoritative guild relationship on the event itself.
  const linkedEvent = await env.DB
    .prepare('SELECT guild_id FROM events WHERE minute_document_id = ? LIMIT 1')
    .bind(context.documentId)
    .first()
    .catch(() => null);
  if (linkedEvent?.guild_id) {
    const guildId = String(linkedEvent.guild_id);
    if (requestedGuildId && requestedGuildId !== guildId) return null;
    return await verifyGuildMember(fetchImpl, env, guildId, userId) ? { guildId } : null;
  }

  if (String(document.createdBy || '') !== String(userId)) return null;

  // A normal document remains personal when no guild was requested. When it is
  // opened inside a Discord guild, bind the session only after verifying real
  // guild membership. This is what safely unlocks Phase 4 cross-product flows.
  if (requestedGuildId) {
    const member = await verifyGuildMember(fetchImpl, env, requestedGuildId, userId);
    return member ? { guildId: requestedGuildId } : null;
  }
  return { guildId: null };
}

export async function handleDiscordOAuthExchange(request, env, fetchImpl = fetch) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!env?.DB || !env.DISCORD_APPLICATION_ID || !env.DISCORD_CLIENT_SECRET) return oauthError(503);

  const instanceId = readActivityInstanceId(request);
  if (!instanceId) return oauthError(401);
  const context = await loadActivityContext(env.DB, instanceId);
  if (!context) return oauthError(401);

  const requestedGuildId = request.headers.get('x-bardo-guild-id')?.trim() || null;
  if (requestedGuildId && !/^\d{17,20}$/.test(requestedGuildId)) return oauthError(400);

  let payload;
  try { payload = await request.json(); } catch { return oauthError(400); }
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
  if (!userId || applicationId !== env.DISCORD_APPLICATION_ID || !scopes.includes('identify')) return oauthError(403);

  const serverAuthorization = await resolveServerAuthorization(fetchImpl, env, context, userId, requestedGuildId);
  if (!serverAuthorization) return oauthError(403);
  const serverGuildId = serverAuthorization.guildId;

  const expiresIn = Math.max(60, Math.min(3600, Number(tokenData?.expires_in) || 3600));
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await updateActivityContextAuthorization(env.DB, instanceId, {
    guildId: serverGuildId,
    expiresAt,
  });

  const sessionToken = await createActivitySessionToken({
    secret: env.BARDO_SESSION_SECRET || env.DISCORD_CLIENT_SECRET,
    instanceId,
    userId,
    guildId: serverGuildId,
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
