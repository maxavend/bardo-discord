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

function threadChecker({type = 12, memberStatus = 200, parentGuild = 'guild-123', parentOverwrites = [], roleBits = '1024'} = {}) {
  const base = createDiscordFetch();
  return createDiscordPermissionChecker({DISCORD_TOKEN: 'test-token', DISCORD_FETCH: async input => {
    const path = new URL(input).pathname;
    if (path.endsWith('/roles')) return Response.json([{id: 'guild-123', permissions: roleBits}]);
    if (path.endsWith('/channels/channel-123')) return Response.json({id: 'channel-123', guild_id: 'guild-123', type, parent_id: 'parent', permission_overwrites: []});
    if (path.endsWith('/channels/parent')) return Response.json({guild_id: parentGuild, permission_overwrites: parentOverwrites});
    if (path.endsWith('/thread-members/user-123')) return Response.json({user_id: 'user-123'}, {status: memberStatus});
    return base(input);
  }}, 'guild-123', 'user-123');
}

test('private thread requires membership or MANAGE_THREADS, and parent visibility', async () => {
  assert.equal(await threadChecker({memberStatus: 404}).canViewChannel('channel-123'), false);
  assert.equal(await threadChecker().canViewChannel('channel-123'), true);
  assert.equal(await threadChecker({memberStatus: 404, roleBits: String(1024n | (1n << 34n))}).canViewChannel('channel-123'), true);
  assert.equal(await threadChecker({parentOverwrites: [{id: 'guild-123', type: 0, deny: '1024', allow: '0'}]}).canViewChannel('channel-123'), false);
  await assert.rejects(threadChecker({memberStatus: 429}).canViewChannel('channel-123'), DiscordUnavailableError);
});

test('public threads inherit parent permissions but unsynced category children do not', async () => {
  const parentOverwrites = [{id: 'guild-123', type: 0, deny: '1024', allow: '0'}];
  assert.equal(await threadChecker({type: 11, parentOverwrites}).canViewChannel('channel-123'), false);
  assert.equal(await threadChecker({type: 0, parentOverwrites}).canViewChannel('channel-123'), true);
  assert.equal(await threadChecker({type: 11, parentGuild: 'foreign'}).canViewChannel('channel-123'), false);
});

test('denied channel context does not reveal guild roles or member directory', async () => {
  const context = await threadChecker({memberStatus: 404}).getChannelContext('channel-123');
  assert.equal(context.permissions.canView, false);
  assert.deepEqual(context.roles, []);
  assert.deepEqual(context.members, []);
});

test('fresh authentication can bypass a positive cached permission after access is revoked', async () => {
  let revoked = false;
  const fetchImpl = input => createDiscordFetch({channelOverwrites: revoked ? [{id: 'user-123', type: 1, deny: '1024', allow: '0'}] : []})(input);
  const env = {DISCORD_TOKEN: 'test', DISCORD_FETCH: fetchImpl};
  assert.equal(await canUserViewChannel(env, 'guild-123', 'user-123', 'channel-123'), true);
  revoked = true;
  assert.equal(await canUserViewChannel({...env, DISCORD_PERMISSION_CACHE_TTL_MS: 0}, 'guild-123', 'user-123', 'channel-123'), false);
});

test('un miembro en timeout puede leer el canal pero no escribir', async () => {
  const fetchImpl = async input => {
    const path = new URL(input).pathname.replace('/api/v10', '');
    if (path === '/guilds/guild-t') return Response.json({id: 'guild-t', owner_id: 'owner'});
    if (path === '/guilds/guild-t/roles') return Response.json([{id: 'guild-t', permissions: String(1024 + 2048)}]);
    if (path === '/guilds/guild-t/members/user-t') {
      return Response.json({user: {id: 'user-t'}, roles: [], communication_disabled_until: new Date(Date.now() + 60_000).toISOString()});
    }
    if (path === '/channels/channel-t') return Response.json({id: 'channel-t', guild_id: 'guild-t', type: 0, permission_overwrites: []});
    return new Response('{}', {status: 404});
  };
  const checker = createDiscordPermissionChecker({DISCORD_TOKEN: 'bot', DISCORD_FETCH: fetchImpl}, 'guild-t', 'user-t');
  assert.equal(await checker.canViewChannel('channel-t'), true);
  assert.equal(await checker.canSendMessages('channel-t'), false);
});
