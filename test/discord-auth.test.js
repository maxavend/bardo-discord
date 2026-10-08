import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDiscordAuthApi, requireDocsSession } from '../src/discord-auth.js';

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
