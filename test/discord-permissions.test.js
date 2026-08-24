import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordPermissionChecker} from '../src/discord-permissions.js';

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
