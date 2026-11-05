// Entorno de pruebas de la web y el MCP: la API de Discord falsa responde a lo
// que usan el inicio de sesión y el selector de canales.
import {CHANNEL, GUILD, USER, createEnv, createTestDb} from './sqlite-d1.js';

export const WEB_ORIGIN = 'https://bardo.test';
export const PRIVATE_CHANNEL = 'channel-private';
export const OTHER_GUILD_CHANNEL = 'channel-other';

const VIEW_AND_SEND = '3072';

const CHANNELS = [
  {id: 'category-1', name: 'General', type: 4, position: 0, guild_id: GUILD, permission_overwrites: []},
  {id: CHANNEL, name: 'general', type: 0, position: 1, parent_id: 'category-1', guild_id: GUILD, permission_overwrites: []},
  {
    id: PRIVATE_CHANNEL,
    name: 'secreto',
    type: 0,
    position: 2,
    guild_id: GUILD,
    // @everyone no puede ver este canal (VIEW_CHANNEL = 1024).
    permission_overwrites: [{id: GUILD, type: 0, allow: '0', deny: '1024'}],
  },
];

export function createWebDiscordFetch({userId = USER, calls = [], sent = []} = {}) {
  return async (input, init = {}) => {
    const url = new URL(input);
    const {pathname} = url;
    calls.push(`${String(init.method || 'GET').toUpperCase()} ${pathname}`);
    if (pathname === '/api/oauth2/token') {
      const form = new URLSearchParams(String(init.body));
      if (form.get('code') !== 'discord-code') return Response.json({error: 'invalid_grant'}, {status: 400});
      return Response.json({access_token: 'discord-access', token_type: 'Bearer', form: Object.fromEntries(form)});
    }
    if (pathname === '/api/v10/users/@me') {
      return Response.json({id: userId, username: 'tester', global_name: 'Tester', avatar: 'abc'});
    }
    if (pathname === '/api/v10/users/@me/guilds') {
      return Response.json([{id: GUILD, name: 'Mi servidor', icon: null}, {id: 'guild-ajeno', name: 'Ajeno', icon: null}]);
    }
    if (pathname.startsWith('/api/v10/guilds/guild-ajeno/members/')) return new Response('{}', {status: 404});
    if (pathname === `/api/v10/guilds/${GUILD}`) return Response.json({id: GUILD, name: 'Mi servidor', icon: null, owner_id: 'owner-1'});
    if (pathname === `/api/v10/guilds/${GUILD}/roles`) return Response.json([{id: GUILD, permissions: VIEW_AND_SEND}]);
    if (pathname === `/api/v10/guilds/${GUILD}/channels`) return Response.json(CHANNELS);
    if (pathname.startsWith(`/api/v10/guilds/${GUILD}/members/search`)) return Response.json([]);
    if (pathname.startsWith(`/api/v10/guilds/${GUILD}/members/`)) {
      return Response.json({user: {id: pathname.split('/').pop()}, roles: []});
    }
    const channel = pathname.match(/^\/api\/v10\/channels\/([^/]+)(\/messages)?$/);
    if (channel && channel[2] && String(init.method).toUpperCase() === 'POST') {
      sent.push({channelId: channel[1], body: JSON.parse(init.body)});
      return Response.json({id: 'message-1'});
    }
    if (channel) {
      const found = CHANNELS.find(item => item.id === channel[1]);
      if (found) return Response.json(found);
      if (channel[1] === OTHER_GUILD_CHANNEL) return Response.json({id: OTHER_GUILD_CHANNEL, guild_id: 'guild-ajeno', permission_overwrites: []});
    }
    return new Response('{}', {status: 404});
  };
}

export function createWebEnv(options = {}, extra = {}) {
  const db = createTestDb();
  const calls = [];
  const sent = [];
  const env = createEnv(db, {
    WEB_ORIGIN,
    DISCORD_CLIENT_SECRET: 'secret',
    DISCORD_PERMISSION_CACHE_TTL_MS: 0,
    DISCORD_FETCH: createWebDiscordFetch({calls, sent, ...options}),
    ...extra,
  });
  return {db, env, calls, sent};
}

/** Navegador mínimo: guarda las cookies entre peticiones al Worker. */
export function createBrowser(worker, env) {
  const jar = new Map();
  const browser = {
    jar,
    async fetch(path, {method = 'GET', headers = {}, body, origin = method === 'GET' ? null : WEB_ORIGIN} = {}) {
      const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
      const response = await worker.fetch(new Request(new URL(path, WEB_ORIGIN), {
        method,
        body,
        redirect: 'manual',
        headers: {...headers, ...(cookie ? {cookie} : {}), ...(origin ? {origin} : {})},
      }), env);
      for (const line of response.headers.getSetCookie()) {
        const [pair, ...attributes] = line.split(';');
        const index = pair.indexOf('=');
        const name = pair.slice(0, index);
        const expired = attributes.some(attribute => attribute.trim().toLowerCase() === 'max-age=0');
        if (expired) jar.delete(name);
        else jar.set(name, pair.slice(index + 1));
      }
      return response;
    },
    /** Inicia sesión con Discord y sigue hasta el destino final (return_to). */
    async login(returnTo = '/') {
      const start = await browser.fetch(`/auth/discord?return_to=${encodeURIComponent(returnTo)}`);
      const authorize = new URL(start.headers.get('location'));
      const state = authorize.searchParams.get('state');
      const callback = await browser.fetch(`/auth/discord/callback?code=discord-code&state=${encodeURIComponent(state)}`);
      return {start, authorize, callback};
    },
  };
  return browser;
}
