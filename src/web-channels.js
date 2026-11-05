// Servidores y canales que una persona puede abrir fuera de Discord. Se consulta
// con el bot, así que solo aparecen servidores donde Bardo está instalado.
//
// Los permisos salen de createDiscordPermissionChecker, el mismo cálculo de
// siempre: aquí solo se le entregan precargados el servidor, los roles, el
// miembro y los canales para no pedir a Discord cada canal por separado.
import {
  DiscordUnavailableError,
  createDiscordPermissionChecker,
  isDiscordUnavailableError,
  retryAfterFromResponse,
} from './discord-permissions.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

// Texto, voz, anuncios, escenario y foros: la Activity también se abre en ellos.
const CHANNEL_TYPES = new Set([0, 2, 5, 13, 15]);
const CATEGORY_TYPE = 4;

// Cada servidor cuesta una consulta para saber si la persona es miembro y tres
// más si lo es; el límite del bot es compartido por todas las personas.
const BOT_GUILDS_PAGE = 200;
const BOT_GUILDS_MAX_PAGES = 5;
const MAX_GUILDS_CHECKED = 50;
const MAX_GUILDS_LISTED = 25;
const CONCURRENCY = 5;

// Abrir el selector varias veces seguidas no vuelve a recorrer Discord.
const RESULT_TTL_MS = 60_000;
const resultCaches = new WeakMap();

async function discordGet(env, path, {notFound} = {}) {
  const fetchImpl = env.DISCORD_FETCH || fetch;
  let response;
  try {
    response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
      headers: {Authorization: `Bot ${String(env.DISCORD_TOKEN).trim()}`},
    });
  } catch (cause) {
    throw new DiscordUnavailableError('Discord API network failure', {cause});
  }
  if (response.status === 429 || response.status >= 500) {
    throw new DiscordUnavailableError(`Discord API ${response.status}`, {
      status: response.status,
      retryAfterMs: await retryAfterFromResponse(response),
    });
  }
  if (response.status === 404 && notFound !== undefined) return notFound;
  if (!response.ok) {
    const error = new Error(`Discord API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function listBotGuilds(env) {
  const guilds = [];
  let after = '0';
  for (let page = 0; page < BOT_GUILDS_MAX_PAGES; page += 1) {
    const batch = await discordGet(env, `/users/@me/guilds?limit=${BOT_GUILDS_PAGE}&after=${after}`);
    if (!Array.isArray(batch)) throw new Error('Unexpected guild list');
    guilds.push(...batch.filter(guild => guild?.id));
    if (batch.length < BOT_GUILDS_PAGE) return {guilds, complete: true};
    after = String(batch[batch.length - 1]?.id || after);
  }
  return {guilds, complete: false};
}

/** fetch que responde con datos ya cargados y deja pasar todo lo demás a Discord. */
function preloadedFetch(baseFetch, responses) {
  return async (input, init) => {
    const method = String(init?.method || 'GET').toUpperCase();
    const key = String(input);
    if (method === 'GET' && responses.has(key)) return Response.json(responses.get(key));
    return baseFetch(input, init);
  };
}

function sortChannels(visible, all) {
  const categoryPosition = new Map(all
    .filter(channel => Number(channel?.type) === CATEGORY_TYPE)
    .map(channel => [String(channel.id), Number(channel.position) || 0]));
  const categoryName = new Map(all
    .filter(channel => Number(channel?.type) === CATEGORY_TYPE)
    .map(channel => [String(channel.id), channel.name || null]));
  const sortKey = channel => [
    channel.parent_id ? categoryPosition.get(String(channel.parent_id)) ?? 0 : -1,
    Number(channel.position) || 0,
  ];
  return [...visible]
    .sort((a, b) => {
      const [categoryA, positionA] = sortKey(a);
      const [categoryB, positionB] = sortKey(b);
      return categoryA - categoryB || positionA - positionB || String(a.name || '').localeCompare(String(b.name || ''), 'es');
    })
    .map(channel => ({
      id: String(channel.id),
      name: channel.name || 'canal',
      type: Number(channel.type),
      category: channel.parent_id ? categoryName.get(String(channel.parent_id)) || null : null,
    }));
}

/** Canales visibles de un servidor, o null si la persona no está o no ve ninguno. */
async function visibleGuild(env, guild, userId) {
  const guildId = String(guild.id);
  const encodedGuild = encodeURIComponent(guildId);
  const memberPath = `/guilds/${encodedGuild}/members/${encodeURIComponent(userId)}`;
  const member = await discordGet(env, memberPath, {notFound: null});
  if (!member) return null;

  const [guildData, roles, channels] = await Promise.all([
    discordGet(env, `/guilds/${encodedGuild}`),
    discordGet(env, `/guilds/${encodedGuild}/roles`),
    discordGet(env, `/guilds/${encodedGuild}/channels`),
  ]);
  const all = Array.isArray(channels) ? channels : [];
  const candidates = all.filter(channel => channel?.id && CHANNEL_TYPES.has(Number(channel.type)));
  if (!candidates.length) return null;

  const responses = new Map([
    [`${DISCORD_API_BASE}/guilds/${encodedGuild}`, guildData],
    [`${DISCORD_API_BASE}${memberPath}`, member],
    [`${DISCORD_API_BASE}/guilds/${encodedGuild}/roles`, roles],
  ]);
  for (const channel of all) {
    if (channel?.id) responses.set(`${DISCORD_API_BASE}/channels/${encodeURIComponent(channel.id)}`, {guild_id: guildId, ...channel});
  }
  const checker = createDiscordPermissionChecker(
    {...env, DISCORD_FETCH: preloadedFetch(env.DISCORD_FETCH || fetch, responses)},
    guildId,
    userId,
  );

  const visible = [];
  for (const channel of candidates) {
    if (await checker.canViewChannel(String(channel.id))) visible.push(channel);
  }
  if (!visible.length) return null;

  return {
    id: guildId,
    name: guildData?.name || guild.name || 'Servidor',
    icon: guildData?.icon ?? guild.icon ?? null,
    channels: sortChannels(visible, all),
  };
}

async function loadUserChannels(env, userId) {
  const {guilds: botGuilds, complete} = await listBotGuilds(env);
  let truncated = !complete || botGuilds.length > MAX_GUILDS_CHECKED;
  const pending = botGuilds.slice(0, MAX_GUILDS_CHECKED);
  const guilds = [];

  for (let start = 0; start < pending.length; start += CONCURRENCY) {
    const settled = await Promise.allSettled(pending.slice(start, start + CONCURRENCY)
      .map(guild => visibleGuild(env, guild, userId)));
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        if (result.value) guilds.push(result.value);
        continue;
      }
      // Discord caído: reintentable. Una negativa definitiva (el bot sin acceso
      // a ese servidor) solo deja fuera ese servidor.
      if (isDiscordUnavailableError(result.reason)) throw result.reason;
      console.warn('Bardo web: servidor omitido', result.reason?.message || result.reason);
    }
    if (guilds.length >= MAX_GUILDS_LISTED) {
      truncated = truncated || guilds.length > MAX_GUILDS_LISTED || start + CONCURRENCY < pending.length;
      break;
    }
  }

  return {
    guilds: guilds.slice(0, MAX_GUILDS_LISTED).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    truncated,
  };
}

/** {guilds: [{id, name, icon, channels: [{id, name, type, category}]}], truncated} */
export function listUserChannels(env, userId) {
  const key = String(userId);
  const configured = Number(env?.DISCORD_PERMISSION_CACHE_TTL_MS);
  const ttl = Number.isFinite(configured) ? configured : RESULT_TTL_MS;
  if (ttl <= 0) return loadUserChannels(env, key);

  const fetchImpl = env.DISCORD_FETCH || fetch;
  let cache = resultCaches.get(fetchImpl);
  if (!cache) {
    cache = new Map();
    resultCaches.set(fetchImpl, cache);
  }
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;
  const promise = loadUserChannels(env, key);
  cache.set(key, {promise, expiresAt: Date.now() + ttl});
  promise.catch(() => cache.delete(key));
  if (cache.size > 1_000) cache.delete(cache.keys().next().value);
  return promise;
}
