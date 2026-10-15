// Llamadas del bot a la API REST de Discord para efectos secundarios (avisos,
// DM, hilos). Nunca lanzan: devuelven un resultado con un `code` legible, para
// que un fallo de Discord jamás deshaga un guardado ya hecho en D1.
import {retryAfterFromResponse} from './discord-permissions.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

function errorCodeFor(status, discordCode) {
  if (discordCode === 50007) return 'dm_closed';
  if (status === 429) return 'rate_limited';
  if (status === 403 || discordCode === 50013 || discordCode === 50001) return 'missing_permissions';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'discord_unavailable';
  return 'failed';
}

export async function discordBotRequest(env, method, path, body) {
  const botToken = String(env?.DISCORD_TOKEN || '').trim();
  if (!botToken) return {ok: false, status: 0, code: 'bot_not_configured', data: null};
  const fetchImpl = env.DISCORD_FETCH || fetch;
  let response;
  try {
    response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${botToken}`,
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    console.error('Discord bot request failed', method, path, error);
    return {ok: false, status: 0, code: 'discord_unavailable', data: null};
  }
  const data = await response.clone().json().catch(() => null);
  if (response.ok) return {ok: true, status: response.status, code: null, data};
  const retryAfterMs = response.status === 429 ? await retryAfterFromResponse(response) : null;
  const code = errorCodeFor(response.status, Number(data?.code));
  console.error('Discord bot request rejected', method, path, response.status, data?.code ?? '');
  return {ok: false, status: response.status, code, data, retryAfterMs};
}

export function postChannelMessage(env, channelId, payload) {
  return discordBotRequest(env, 'POST', `/channels/${encodeURIComponent(channelId)}/messages`, payload);
}

export async function sendDirectMessage(env, userId, payload) {
  const channel = await discordBotRequest(env, 'POST', '/users/@me/channels', {recipient_id: String(userId)});
  if (!channel.ok) return channel;
  return postChannelMessage(env, channel.data?.id, payload);
}

export function startThreadFromMessage(env, channelId, messageId, name) {
  return discordBotRequest(env, 'POST',
    `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/threads`,
    {name, auto_archive_duration: 10080});
}

export function createPublicThread(env, channelId, name) {
  return discordBotRequest(env, 'POST', `/channels/${encodeURIComponent(channelId)}/threads`,
    {name, type: 11, auto_archive_duration: 10080});
}

export function getOriginalInteractionMessage(env, applicationId, interactionToken) {
  return discordBotRequest(env, 'GET',
    `/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(interactionToken)}/messages/@original`);
}

export function getChannel(env, channelId) {
  return discordBotRequest(env, 'GET', `/channels/${encodeURIComponent(channelId)}`);
}
