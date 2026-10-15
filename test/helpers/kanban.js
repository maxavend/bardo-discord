// Fixtures de Tareas: un Discord falso que además registra los mensajes,
// MD e hilos que publica el bot, y un cliente para la API de Kanban.
import {handleKanbanApi} from '../../src/kanban-api.js';
import {CHANNEL, GUILD, authHeaders, createDiscordFetch, createEnv, createTestDb, insertSession} from './sqlite-d1.js';

const bits = names => names.reduce((total, bit) => total | (1n << BigInt(bit)), 0n).toString();
// Ver canal, enviar mensajes, crear hilos públicos, enviar mensajes en hilos.
export const FULL_BOT_PERMISSIONS = bits([10, 11, 35, 38]);

export const ASSIGNEE = '222222222';
export const OUTSIDER = '999999999';

export function createKanbanDiscord({
  permissions = FULL_BOT_PERMISSIONS,
  channelType = 0,
  respond = null,
} = {}) {
  const sent = [];
  const base = createDiscordFetch({permissions});
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const path = url.pathname.replace('/api/v10', '');
    if (method !== 'GET') sent.push({method, path, body});
    const custom = respond?.({method, path, body});
    if (custom) return custom;

    const channelMatch = path.match(/^\/channels\/([^/]+)$/);
    if (method === 'GET' && channelMatch && [CHANNEL, 'channel-b'].includes(channelMatch[1])) {
      return Response.json({
        id: channelMatch[1], name: 'general', guild_id: GUILD, type: channelType,
        permission_overwrites: [{type: 1, id: OUTSIDER, allow: '0', deny: '1024'}],
      });
    }
    if (method === 'POST' && path === '/users/@me/channels') return Response.json({id: `dm-${body.recipient_id}`});
    if (method === 'POST' && /^\/channels\/[^/]+\/messages$/.test(path)) return Response.json({id: `msg-${sent.length}`});
    if (method === 'POST' && /\/threads$/.test(path)) return Response.json({id: `thread-${sent.length}`});
    if (method === 'GET' && path.startsWith('/webhooks/')) return Response.json({id: 'original-msg'});
    return base(input, init);
  };
  return {fetchImpl, sent};
}

export async function setupKanban(options = {}) {
  const db = createTestDb();
  await insertSession(db);
  await insertSession(db, {token: 'token-b', channelId: 'channel-b'});
  const discord = createKanbanDiscord(options);
  const env = createEnv(db, {DISCORD_FETCH: discord.fetchImpl, DISCORD_PERMISSION_CACHE_TTL_MS: 0});
  const pending = [];
  const ctx = {waitUntil: promise => pending.push(promise)};

  async function call(path, {method = 'GET', body, token} = {}) {
    const request = new Request(`https://example.com/api/kanban${path}`, {
      method,
      headers: {...authHeaders(token), ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const response = await handleKanbanApi(request, new URL(request.url), env, ctx);
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* vacío */ }
    return {status: response.status, json};
  }

  const flush = async () => {
    while (pending.length) await Promise.all(pending.splice(0));
  };

  async function board() {
    return (await call('/board')).json;
  }

  async function createCard(fields) {
    return call('/cards', {method: 'POST', body: fields});
  }

  return {db, env, discord, ctx, call, flush, board, createCard};
}
