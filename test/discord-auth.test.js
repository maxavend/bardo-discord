import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDiscordAuthApi, requireDocsSession } from '../src/discord-auth.js';
import {createTestDb, insertSession} from './helpers/sqlite-d1.js';

function createAuthMockDb() {
  const sessions = new Map();
  return {
    sessions,
    prepare(query) {
      return {
        bind(...params) {
          return {
            async first() {
              if (query.includes('FROM docs_sessions WHERE token_hash = ?')) {
                const [hash] = params;
                return sessions.get(hash) || null;
              }
              return null;
            },
            async run() {
              if (query.includes('INSERT INTO docs_sessions')) {
                const [token_hash, user_id, guild_id, username, avatar, created_at, expires_at] = params;
                sessions.set(token_hash, {
                  token_hash,
                  user_id,
                  guild_id,
                  username,
                  avatar,
                  created_at,
                  expires_at,
                });
                return { meta: { changes: 1 } };
              }
              if (query.includes('DELETE FROM docs_sessions WHERE token_hash = ?')) {
                const [hash] = params;
                sessions.delete(hash);
                return { meta: { changes: 1 } };
              }
              if (query.includes('DELETE FROM docs_sessions WHERE expires_at <=')) {
                return { meta: { changes: 0 } };
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

test('handleDiscordAuthApi devuelve 400 si falta el código de autorización', async () => {
  const req = new Request('http://localhost/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: 'guild-123' }),
  });
  const url = new URL(req.url);
  const res = await handleDiscordAuthApi(req, url, { DB: createAuthMockDb() });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.code, 'code_required');
  assert.match(data.error, /autorización/);
});

test('handleDiscordAuthApi devuelve 400 si falta el guildId', async () => {
  const req = new Request('http://localhost/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'auth-code-123' }),
  });
  const url = new URL(req.url);
  const res = await handleDiscordAuthApi(req, url, { DB: createAuthMockDb() });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.code, 'guild_required');
  assert.match(data.error, /servidor de Discord/);
});

test('handleDiscordAuthApi devuelve 503 si falta DISCORD_CLIENT_SECRET', async () => {
  const req = new Request('http://localhost/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'auth-code-123', guildId: 'guild-123', channelId: 'channel-123' }),
  });
  const url = new URL(req.url);
  const res = await handleDiscordAuthApi(req, url, { DB: createAuthMockDb() });
  assert.equal(res.status, 503);
  const data = await res.json();
  assert.equal(data.code, 'oauth_not_configured');
  assert.match(data.error, /no está configurado/);
});

test('requireDocsSession rechaza requests sin token de autorización', async () => {
  const req = new Request('http://localhost/api/docs');
  const res = await requireDocsSession(req, { DB: createAuthMockDb() });
  assert.ok(res.error);
  assert.equal(res.error.status, 401);
});

test('requireDocsSession responde en español con código estable', async () => {
  const req = new Request('http://localhost/api/docs', { headers: { Authorization: 'Bearer desconocido' } });
  const res = await requireDocsSession(req, { DB: createAuthMockDb() });
  assert.equal(res.error.status, 401);
  const data = await res.error.json();
  assert.equal(data.error, 'session_not_found');
  assert.match(data.message, /Tu sesión de Bardo expiró/);
});

test('los tokens válidos del mismo usuario comparten su límite antes de consultar Discord', async () => {
  const db = createTestDb();
  await insertSession(db, {token: 'first-token'});
  await insertSession(db, {token: 'second-token', channelId: 'another-channel'});
  const keys = [];
  const env = {DB: db, API_RATE_LIMITER: {limit: async ({key}) => {
    keys.push(key);
    return {success: false};
  }}};
  for (const token of ['first-token', 'second-token']) {
    const result = await requireDocsSession(new Request('https://example.com/api/docs', {
      headers: {Authorization: `Bearer ${token}`},
    }), env);
    assert.equal(result.error.status, 429);
    assert.equal(result.session, undefined);
  }
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1], 'cambiar de token o canal no cambia el presupuesto');
  const invalid = await requireDocsSession(new Request('https://example.com/api/docs', {
    headers: {Authorization: 'Bearer unknown'},
  }), env);
  assert.equal(invalid.error.status, 401);
  assert.equal(keys.length, 2, 'una petición sin identidad no consume el límite de otro usuario');
});

test('OAuth rate limits and outages preserve retryable status instead of logging the user out', async () => {
  for (const status of [429, 503]) {
    const req = new Request('https://example.com/api/auth/token', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({code: 'code', guildId: 'guild', channelId: 'channel'}),
    });
    const res = await handleDiscordAuthApi(req, new URL(req.url), {
      DB: createAuthMockDb(), DISCORD_CLIENT_SECRET: 'test-only',
      DISCORD_FETCH: async () => Response.json({retry_after: 4}, {status}),
    });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('Retry-After'), '4');
    assert.equal((await res.json()).retryAfterMs, 4000);
  }
});

test('el inicio de sesión distingue un canal que Bardo no ve de uno que la persona no ve', async () => {
  const login = async channelResponse => {
    const req = new Request('https://example.com/api/auth/token', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({code: 'code', guildId: 'guild', channelId: 'channel'}),
    });
    const res = await handleDiscordAuthApi(req, new URL(req.url), {
      DB: createAuthMockDb(), DISCORD_CLIENT_SECRET: 'test-only', DISCORD_TOKEN: 'bot',
      DISCORD_FETCH: async url => {
        const path = String(url);
        if (path.includes('/oauth2/token')) return Response.json({access_token: 'oauth'});
        if (path.endsWith('/users/@me')) return Response.json({id: 'user', username: 'Persona'});
        if (path.endsWith('/guilds/guild')) return Response.json({id: 'guild', owner_id: 'owner'});
        if (path.endsWith('/members/user')) return Response.json({roles: []});
        if (path.endsWith('/roles')) return Response.json([{id: 'guild', permissions: '1024'}]);
        if (path.endsWith('/channels/channel')) return channelResponse();
        return Response.json({}, {status: 404});
      },
    });
    return {status: res.status, body: await res.json()};
  };

  // Canal privado sin el rol del bot: Discord responde Missing Access al bot.
  for (const status of [403, 404]) {
    const hidden = await login(() => Response.json({message: 'Missing Access', code: 50001}, {status}));
    assert.equal(hidden.status, 403);
    assert.equal(hidden.body.code, 'bot_channel_forbidden');
    assert.match(hidden.body.message, /Bardo no puede ver este canal.*rol Bardo/);
  }

  // El bot sí lo ve, pero la persona tiene negado «Ver canal».
  const denied = await login(() => Response.json({
    id: 'channel', guild_id: 'guild', type: 0,
    permission_overwrites: [{id: 'guild', type: 0, allow: '0', deny: '1024'}],
  }));
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'channel_forbidden');
  assert.match(denied.body.message, /No tienes acceso a este canal/);
});
