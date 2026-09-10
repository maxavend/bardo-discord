import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePlannerApi } from '../src/planner-api.js';

function discordFetch(input) {
  const url = new URL(input);
  if (url.pathname === '/api/v10/guilds/guild-123') {
    return Promise.resolve(new Response(JSON.stringify({owner_id: 'owner-1'}), {status: 200}));
  }
  if (url.pathname === '/api/v10/guilds/guild-123/members/user-123') {
    return Promise.resolve(new Response(JSON.stringify({user: {id: 'user-123'}, roles: ['role-1']}), {status: 200}));
  }
  if (url.pathname === '/api/v10/guilds/guild-123/roles') {
    return Promise.resolve(new Response(JSON.stringify([
      {id: 'guild-123', name: '@everyone', permissions: '1024', position: 0},
      {id: 'role-1', name: 'Diseño', color: 5793266, permissions: '16', position: 1, managed: false},
      {id: 'role-2', name: 'Devs', color: 5763719, permissions: '0', position: 2, managed: false},
    ]), {status: 200}));
  }
  if (url.pathname === '/api/v10/channels/channel-123') {
    return Promise.resolve(new Response(JSON.stringify({id: 'channel-123', name: 'general', guild_id: 'guild-123', permission_overwrites: []}), {status: 200}));
  }
  if (url.pathname === '/api/v10/guilds/guild-123/members') {
    return Promise.resolve(new Response(JSON.stringify([
      {user: {id: 'user-123', username: 'maxi', global_name: 'Maxi'}, roles: ['role-1']},
      {user: {id: 'user-456', username: 'pau', global_name: 'Paula'}, roles: ['role-1']},
    ]), {status: 200}));
  }
  return Promise.resolve(new Response('{}', {status: 404}));
}

function createPlannerMockDb() {
  const sessions = new Map();
  const liveSessions = new Map();

  const executeQuery = (query, params = []) => ({
    async first() {
      if (query.includes('FROM docs_sessions WHERE token_hash = ?')) {
        const [hash] = params;
        return {
          token_hash: hash,
          user_id: 'user-123',
          guild_id: 'guild-123',
          channel_id: 'channel-123',
          username: 'Maxi',
          avatar: null,
          created_at: '2026-08-24T10:00:00.000Z',
          expires_at: '2030-08-25T10:00:00.000Z',
        };
      }
      if (query.includes('planner_sessions') && query.includes('WHERE id = ?')) {
        const [id] = params;
        return sessions.get(id) || null;
      }
      if (query.includes('planner_live_sessions') && query.includes('WHERE session_id = ?')) {
        const [sessionId] = params;
        return liveSessions.get(sessionId) || null;
      }
      return null;
    },
    async all() {
      if (query.includes('planner_sessions') && query.includes('WHERE guild_id = ?')) {
        return { results: [...sessions.values()] };
      }
      return { results: [] };
    },
    async run() {
      if (query.includes('INSERT INTO planner_sessions')) {
        const [id, guildId, channelId, title, hostId, hostName, date, startTime, targetDuration, description, mentions, blocksJson, status, createdAt, createdBy, updatedAt, updatedBy] = params;
        sessions.set(id, {
          id,
          guild_id: guildId,
          channel_id: channelId,
          title,
          host_id: hostId,
          host_name: hostName,
          date,
          start_time: startTime,
          target_duration: targetDuration,
          description,
          mentions,
          blocks_json: blocksJson,
          status,
          created_at: createdAt,
          created_by: createdBy,
          updated_at: updatedAt,
          updated_by: updatedBy,
        });
        return { success: true };
      }
      if (query.includes('INSERT INTO planner_live_sessions')) {
        const [sessionId, guildId, channelId, status, activeBlockId, activePointId, blockStartedAt, blockElapsedBeforePauseMs, sessionStartedAt, sessionPausedAt, totalPausedMs, decisionsJson, recordingsMetaJson, updatedAt, updatedBy] = params;
        liveSessions.set(sessionId, {
          session_id: sessionId,
          guild_id: guildId,
          channel_id: channelId,
          status,
          active_block_id: activeBlockId,
          active_point_id: activePointId,
          block_started_at: blockStartedAt,
          block_elapsed_before_pause_ms: blockElapsedBeforePauseMs,
          session_started_at: sessionStartedAt,
          session_paused_at: sessionPausedAt,
          total_paused_ms: totalPausedMs,
          decisions_json: decisionsJson,
          recordings_meta_json: recordingsMetaJson,
          updated_at: updatedAt,
          updated_by: updatedBy,
        });
        return { success: true };
      }
      if (query.includes('status = \'archived\'')) {
        const [updatedAt, updatedBy, id] = params;
        const existing = sessions.get(id);
        if (existing) {
          existing.status = 'archived';
          existing.updated_at = updatedAt;
          existing.updated_by = updatedBy;
        }
        return { success: true };
      }
      return { success: true };
    },
  });

  return {
    prepare(query) {
      return {
        bind(...params) {
          return executeQuery(query, params);
        },
      };
    },
  };
}

function createEnv(db = createPlannerMockDb()) {
  return {
    DB: db,
    DISCORD_TOKEN: 'test-bot-token',
    DISCORD_FETCH: discordFetch,
  };
}

test('handlePlannerApi rechaza requests sin token de autorización', async () => {
  const env = createEnv();
  const req = new Request('https://example.com/api/planner/sessions', { method: 'GET' });
  const res = await handlePlannerApi(req, new URL(req.url), env);
  assert.equal(res.status, 401);
});

test('handlePlannerApi devuelve channel-context con roles y miembros reales de Discord', async () => {
  const env = createEnv();
  const req = new Request('https://example.com/api/discord/channel-context', {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-token-123' },
  });
  const res = await handlePlannerApi(req, new URL(req.url), env);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.guildId, 'guild-123');
  assert.equal(data.channelId, 'channel-123');
  assert.equal(data.roles.length, 2);
  assert.equal(data.roles[0].name, 'Devs');
  assert.equal(data.members.length, 2);
  assert.equal(data.members[0].globalName, 'Maxi');
  assert.equal(typeof data.permissions.canView, 'boolean');
});

test('handlePlannerApi crea una nueva sesión y la recupera desde D1', async () => {
  const env = createEnv();
  const reqPost = new Request('https://example.com/api/planner/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token-123',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Planificación Sprint 14',
      date: '2026-09-10',
      startTime: '11:00',
      targetDuration: 45,
      blocks: [{ id: 'b-1', title: 'Objetivos', durationMinutes: 15, subpoints: [] }],
    }),
  });

  const resPost = await handlePlannerApi(reqPost, new URL(reqPost.url), env);
  assert.equal(resPost.status, 201);
  const created = await resPost.json();
  assert.equal(created.title, 'Planificación Sprint 14');
  assert.equal(created.blocks.length, 1);

  const reqList = new Request('https://example.com/api/planner/sessions', {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-token-123' },
  });
  const resList = await handlePlannerApi(reqList, new URL(reqList.url), env);
  assert.equal(resList.status, 200);
  const list = await resList.json();
  assert.equal(list.sessions.length, 1);
  assert.equal(list.sessions[0].id, created.id);
});

test('handlePlannerApi actualiza y persiste el estado de una sesión en vivo', async () => {
  const env = createEnv();
  const reqLivePost = new Request('https://example.com/api/planner/sessions/sess-1/live', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token-123',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: 'running',
      activeBlockId: 'b-1',
      activePointId: 'p-1',
      blockStartedAt: Date.now(),
      decisions: [{ id: 'd-1', content: 'Aprobado el sprint' }],
    }),
  });

  const resLivePost = await handlePlannerApi(reqLivePost, new URL(reqLivePost.url), env);
  assert.equal(resLivePost.status, 200);

  const reqLiveGet = new Request('https://example.com/api/planner/sessions/sess-1/live', {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-token-123' },
  });
  const resLiveGet = await handlePlannerApi(reqLiveGet, new URL(reqLiveGet.url), env);
  assert.equal(resLiveGet.status, 200);
  const live = await resLiveGet.json();
  assert.equal(live.liveState.status, 'running');
  assert.equal(live.liveState.activeBlockId, 'b-1');
  assert.equal(live.liveState.decisions.length, 1);
});

test('handlePlannerApi elimina (archiva) una sesión correctamente con DELETE', async () => {
  const env = createEnv();
  // Primero creamos la sesión
  const reqPost = new Request('https://example.com/api/planner/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token-123',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Reunión para eliminar',
      date: '2026-09-12',
      startTime: '16:00',
      targetDuration: 30,
      blocks: [],
    }),
  });
  const resPost = await handlePlannerApi(reqPost, new URL(reqPost.url), env);
  assert.equal(resPost.status, 201);
  const created = await resPost.json();

  // Ejecutamos DELETE
  const reqDelete = new Request(`https://example.com/api/planner/sessions/${created.id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer valid-token-123' },
  });
  const resDelete = await handlePlannerApi(reqDelete, new URL(reqDelete.url), env);
  assert.equal(resDelete.status, 200);
  const deleteData = await resDelete.json();
  assert.equal(deleteData.ok, true);
  assert.equal(deleteData.archived, true);
  assert.equal(deleteData.id, created.id);
});

