import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DiscordUnavailableError,
  canUserViewChannel,
  createDiscordPermissionChecker,
} from '../src/discord-permissions.js';

function createDiscordFetch({channelOverwrites = []} = {}) {
  return async input => {
    const url = new URL(input);
    if (url.pathname === '/api/v10/guilds/guild-123') {
      return new Response(JSON.stringify({owner_id: 'owner-1'}), {status: 200});
    }
    if (url.pathname === '/api/v10/guilds/guild-123/members/user-123') {
      return new Response(JSON.stringify({roles: ['role-reader']}), {status: 200});
    }
    if (url.pathname === '/api/v10/guilds/guild-123/roles') {
      return new Response(JSON.stringify([
        {id: 'guild-123', permissions: '0'},
        {id: 'role-reader', permissions: '1024'},
      ]), {status: 200});
    }
    if (url.pathname === '/api/v10/channels/channel-123') {
      return new Response(JSON.stringify({
        id: 'channel-123',
        guild_id: 'guild-123',
        permission_overwrites: channelOverwrites,
      }), {status: 200});
    }
    return new Response('{}', {status: 404});
  };
}

test('Discord permissions allow VIEW_CHANNEL from a member role', async () => {
  const checker = createDiscordPermissionChecker({
    DISCORD_TOKEN: 'test-token',
    DISCORD_FETCH: createDiscordFetch(),
  }, 'guild-123', 'user-123');

  assert.equal(await checker.canViewChannel('channel-123'), true);
});

test('Discord channel member overwrite can deny VIEW_CHANNEL', async () => {
  const checker = createDiscordPermissionChecker({
    DISCORD_TOKEN: 'test-token',
    DISCORD_FETCH: createDiscordFetch({
      channelOverwrites: [{
        id: 'user-123',
        type: 1,
        allow: '0',
        deny: '1024',
      }],
    }),
  }, 'guild-123', 'user-123');

  assert.equal(await checker.canViewChannel('channel-123'), false);
});

test('Discord permission checks fail closed if the channel belongs to another guild', async () => {
  const checker = createDiscordPermissionChecker({
    DISCORD_TOKEN: 'test-token',
    DISCORD_FETCH: async input => {
      const response = await createDiscordFetch()(input);
      const url = new URL(input);
      if (url.pathname === '/api/v10/channels/channel-123') {
        return new Response(JSON.stringify({guild_id: 'guild-other', permission_overwrites: []}), {status: 200});
      }
      return response;
    },
  }, 'guild-123', 'user-123');

  assert.equal(await checker.canViewChannel('channel-123'), false);
});

test('un 429 de Discord no se trata como "sin permiso": lanza DiscordUnavailableError con retryAfterMs', async () => {
  const checker = createDiscordPermissionChecker({
    DISCORD_TOKEN: 'test-token',
    DISCORD_FETCH: async () => new Response(JSON.stringify({retry_after: 2.5}), {status: 429}),
  }, 'guild-123', 'user-123');

  await assert.rejects(checker.canViewChannel('channel-123'), error => {
    assert.ok(error instanceof DiscordUnavailableError);
    assert.equal(error.retryAfterMs, 2500);
    return true;
  });
});

test('errores 5xx y de red de Discord también son "no disponible"', async () => {
  for (const fetchImpl of [
    async () => new Response('<html>', {status: 502}),
    async () => { throw new TypeError('network down'); },
  ]) {
    const checker = createDiscordPermissionChecker({DISCORD_TOKEN: 't', DISCORD_FETCH: fetchImpl}, 'guild-123', 'user-123');
    await assert.rejects(checker.canViewChannel('channel-123'), DiscordUnavailableError);
  }
});

test('un 404 de Discord (miembro que salió) sigue fallando cerrado', async () => {
  const checker = createDiscordPermissionChecker({
    DISCORD_TOKEN: 't',
    DISCORD_FETCH: async () => new Response('{}', {status: 404}),
  }, 'guild-123', 'user-123');
  assert.equal(await checker.canViewChannel('channel-123'), false);
});

test('los permisos calculados se cachean ~60 s por usuario y canal', async () => {
  let calls = 0;
  const base = createDiscordFetch();
  const env = {
    DISCORD_TOKEN: 'test-token',
    DISCORD_FETCH: async input => { calls += 1; return base(input); },
  };
  assert.equal(await canUserViewChannel(env, 'guild-123', 'user-123', 'channel-123'), true);
  const afterFirst = calls;
  assert.ok(afterFirst >= 4);
  assert.equal(await canUserViewChannel(env, 'guild-123', 'user-123', 'channel-123'), true);
  assert.equal(calls, afterFirst, 'la segunda verificación no debe llamar a Discord');

  // A different user is not served from another user's cache entry.
  await canUserViewChannel(env, 'guild-123', 'user-999', 'channel-123');
  assert.ok(calls > afterFirst);
});

test('el caché se puede desactivar con DISCORD_PERMISSION_CACHE_TTL_MS=0', async () => {
  let calls = 0;
  const base = createDiscordFetch();
  const env = {
    DISCORD_TOKEN: 'test-token',
    DISCORD_PERMISSION_CACHE_TTL_MS: 0,
    DISCORD_FETCH: async input => { calls += 1; return base(input); },
  };
  await canUserViewChannel(env, 'guild-123', 'user-123', 'channel-123');
  const afterFirst = calls;
  await canUserViewChannel(env, 'guild-123', 'user-123', 'channel-123');
  assert.equal(calls, afterFirst * 2);
});
