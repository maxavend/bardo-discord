import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePlannerApi } from '../src/planner-api.js';
import {
  CHANNEL,
  GUILD,
  authHeaders,
  createDiscordFetch,
  createEnv,
  createTestDb,
  insertSession,
} from './helpers/sqlite-d1.js';

function discordFetchWithMembers() {
  const base = createDiscordFetch({ permissions: '1024' });
  return async (input, init) => {
    const url = new URL(input);
    if (url.pathname === `/api/v10/guilds/${GUILD}/roles`) {
      return Response.json([
        { id: GUILD, name: '@everyone', permissions: '1024', position: 0 },
        { id: 'role-1', name: 'Diseño', color: 5793266, permissions: '16', position: 1, managed: false },
        { id: 'role-2', name: 'Devs', color: 5763719, permissions: '0', position: 2, managed: false },
      ]);
    }
    if (url.pathname === `/api/v10/guilds/${GUILD}/members`) {
      return Response.json([
        { user: { id: 'user-123', username: 'maxi', global_name: 'Maxi' }, roles: ['role-1'] },
        { user: { id: 'user-456', username: 'pau', global_name: 'Paula' }, roles: ['role-1'] },
      ]);
    }
    return base(input, init);
  };
}

async function setup() {
  const db = createTestDb();
  await insertSession(db);
  // Same user, another channel of the same guild, and another guild.
  await insertSession(db, { token: 'token-b', channelId: 'channel-b' });
  await insertSession(db, { token: 'token-x', guildId: 'guild-x', channelId: 'channel-x' });
  const env = createEnv(db, {
    DISCORD_FETCH: createDiscordFetch({ channels: { [CHANNEL]: GUILD, 'channel-b': GUILD, 'channel-x': 'guild-x' } }),
  });
  return { db, env };
}

async function call(env, path, { method = 'GET', body, token, raw } = {}) {
  const request = new Request(`https://example.com${path}`, {
    method,
    headers: { ...authHeaders(token), ...(body !== undefined || raw ? { 'Content-Type': 'application/json' } : {}) },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const response = await handlePlannerApi(request, new URL(request.url), env);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status, json };
}

async function createMeeting(env, body = {}, token) {
  const result = await call(env, '/api/planner/sessions', {
    method: 'POST',
    token,
    body: { title: 'Planificación Sprint 14', date: '2026-09-10', startTime: '11:00', targetDuration: 45, blocks: [{ id: 'b-1', title: 'Objetivos' }], ...body },
  });
  return result;
}

test('handlePlannerApi rechaza requests sin token de autorización', async () => {
  const { env } = await setup();
  const req = new Request('https://example.com/api/planner/sessions');
  const res = await handlePlannerApi(req, new URL(req.url), env);
  assert.equal(res.status, 401);
});

test('channel-context devuelve roles y miembros reales de Discord', async () => {
  const db = createTestDb();
  await insertSession(db);
  const env = createEnv(db, { DISCORD_FETCH: discordFetchWithMembers() });
  const { status, json } = await call(env, '/api/discord/channel-context');
  assert.equal(status, 200);
  assert.equal(json.guildId, GUILD);
  assert.equal(json.channelId, CHANNEL);
  assert.equal(json.roles.length, 2);
  assert.equal(json.roles[0].name, 'Devs');
  assert.equal(json.members.length, 2);
  assert.equal(json.members[0].globalName, 'Maxi');
});

test('POST crea una reunión y GET la lista; status NULL cuenta como activa', async () => {
  const { db, env } = await setup();
  const created = await createMeeting(env);
  assert.equal(created.status, 201);
  assert.equal(created.json.session.title, 'Planificación Sprint 14');
  assert.equal(created.json.blocks.length, 1);

  db.run(
    `INSERT INTO planner_sessions (id, guild_id, channel_id, title, date, start_time, target_duration, blocks_json,
       status, created_at, created_by, updated_at, updated_by)
     VALUES ('legacy-null', ?, ?, 'Legacy', '2026-01-01', '10:00', 60, '[]', NULL, 'x', 'u', 'x', 'u')`,
    GUILD, CHANNEL,
  );
  const list = await call(env, '/api/planner/sessions');
  assert.deepEqual(list.json.sessions.map(s => s.id).sort(), [created.json.id, 'legacy-null'].sort());
  assert.equal(list.json.sessions.find(s => s.id === 'legacy-null').status, 'scheduled');
});

test('POST con id de otro canal responde 409 exists y no sobrescribe la reunión ajena', async () => {
  const { db, env } = await setup();
  const original = await createMeeting(env, { id: 'sess-shared', title: 'Reunión canal A' });
  assert.equal(original.status, 201);

  for (const token of ['token-b', 'token-x']) {
    const hijack = await call(env, '/api/planner/sessions', {
      method: 'POST',
      token,
      body: { id: 'sess-shared', title: 'Pisada', blocks: [] },
    });
    assert.equal(hijack.status, 409);
    assert.equal(hijack.json.error, 'exists');
  }
  const row = db.row("SELECT title, blocks_json FROM planner_sessions WHERE id = 'sess-shared'");
  assert.equal(row.title, 'Reunión canal A');
  assert.equal(JSON.parse(row.blocks_json).length, 1);
});

test('POST con el mismo id en el mismo canal hace upsert', async () => {
  const { env } = await setup();
  await createMeeting(env, { id: 'sess-1' });
  const again = await createMeeting(env, { id: 'sess-1', title: 'Renombrada' });
  assert.equal(again.status, 200);
  assert.equal(again.json.session.title, 'Renombrada');
});

test('POST/PATCH rechazan cuerpos de más de 512 KB con 413', async () => {
  const { env } = await setup();
  const big = 'x'.repeat(600 * 1024);
  const post = await createMeeting(env, { blocks: [{ id: 'b', title: big }] });
  assert.equal(post.status, 413);
  assert.equal(post.json.error, 'too_large');

  await createMeeting(env, { id: 'sess-1' });
  const patch = await call(env, '/api/planner/sessions/sess-1', { method: 'PATCH', body: { description: 'ok', blocks: [{ title: big }] } });
  assert.equal(patch.status, 413);
});

test('PATCH acepta host como alias de hostName y devuelve {session} con nuevo updatedAt', async () => {
  const { env } = await setup();
  const created = await createMeeting(env, { id: 'sess-1' });
  const { status, json } = await call(env, '/api/planner/sessions/sess-1', {
    method: 'PATCH',
    body: { host: 'Camila', baseUpdatedAt: created.json.updatedAt },
  });
  assert.equal(status, 200);
  assert.equal(json.session.hostName, 'Camila');
  assert.notEqual(json.session.updatedAt, created.json.updatedAt);
});

test('PATCH con baseUpdatedAt obsoleto responde 409 conflict con la versión actual', async () => {
  const { env } = await setup();
  const created = await createMeeting(env, { id: 'sess-1' });
  const base = created.json.updatedAt;
  const first = await call(env, '/api/planner/sessions/sess-1', { method: 'PATCH', body: { title: 'Versión A', baseUpdatedAt: base } });
  assert.equal(first.status, 200);
  const stale = await call(env, '/api/planner/sessions/sess-1', { method: 'PATCH', body: { title: 'Versión B', baseUpdatedAt: base } });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'conflict');
  assert.equal(stale.json.session.title, 'Versión A');
});

test('PATCH no puede archivar ni desarchivar', async () => {
  const { db, env } = await setup();
  await createMeeting(env, { id: 'sess-1' });
  await call(env, '/api/planner/sessions/sess-1', { method: 'PATCH', body: { status: 'archived' } });
  assert.equal(db.row("SELECT status FROM planner_sessions WHERE id = 'sess-1'").status, 'scheduled');

  await call(env, '/api/planner/sessions/sess-1', { method: 'DELETE' });
  await call(env, '/api/planner/sessions/sess-1', { method: 'PATCH', body: { status: 'scheduled', title: 'Editada' } });
  const row = db.row("SELECT status, title FROM planner_sessions WHERE id = 'sess-1'");
  assert.equal(row.status, 'archived');
  assert.equal(row.title, 'Editada');
});

test('PATCH de una reunión de otro canal responde 404', async () => {
  const { env } = await setup();
  await createMeeting(env, { id: 'sess-1' });
  const { status } = await call(env, '/api/planner/sessions/sess-1', { method: 'PATCH', token: 'token-b', body: { title: 'X' } });
  assert.equal(status, 404);
});

test('live: guarda el estado completo del cliente y lo devuelve tal cual', async () => {
  const { db, env } = await setup();
  await createMeeting(env, { id: 'sess-1' });
  const liveState = {
    status: 'running',
    liveActiveBlockId: 'b-1',
    liveActivePointId: 'p-1',
    pointStatuses: { 'p-1': 'active' },
    completedBlockIds: [],
    activeBlockStartedAt: 1_700_000_000_000,
    accumulatedPausedMs: 5000,
    recordings: [{ id: 'rec-1', pointId: 'p-1', durationMs: 1000 }],
    decisions: [{ id: 'd-1', content: 'Aprobado el sprint' }],
    updatedAt: '2026-09-10T11:05:00.000Z',
  };
  const post = await call(env, '/api/planner/sessions/sess-1/live', { method: 'POST', body: liveState });
  assert.equal(post.status, 200);

  const get = await call(env, '/api/planner/sessions/sess-1/live');
  assert.equal(get.status, 200);
  assert.deepEqual(get.json.liveState, { ...liveState, sessionId: 'sess-1', plannerSessionId: 'sess-1' });

  // Legacy columns are still filled where derivable.
  const row = db.row("SELECT status, active_block_id, total_paused_ms FROM planner_live_sessions WHERE session_id = 'sess-1'");
  assert.equal(row.active_block_id, 'b-1');
  assert.equal(row.total_paused_ms, 5000);
  // running → meeting shows as live.
  assert.equal(db.row("SELECT status FROM planner_sessions WHERE id = 'sess-1'").status, 'live');
});

test('live: conserva el sessionId propio del cliente (id de la corrida de grabación)', async () => {
  const { env } = await setup();
  await createMeeting(env, { id: 'sess-1' });
  await call(env, '/api/planner/sessions/sess-1/live', {
    method: 'POST',
    body: { status: 'running', sessionId: 'session-1700000000000', plannerSessionId: 'otro', updatedAt: '2026-09-10T11:05:00.000Z' },
  });
  const get = await call(env, '/api/planner/sessions/sess-1/live');
  assert.equal(get.json.liveState.sessionId, 'session-1700000000000');
  assert.equal(get.json.liveState.plannerSessionId, 'sess-1');
});

test('live: el estado de la reunión sigue al runner (completed / idle)', async () => {
  const { db, env } = await setup();
  await createMeeting(env, { id: 'sess-1' });
  const status = () => db.row("SELECT status FROM planner_sessions WHERE id = 'sess-1'").status;

  await call(env, '/api/planner/sessions/sess-1/live', { method: 'POST', body: { status: 'paused' } });
  assert.equal(status(), 'live');
  await call(env, '/api/planner/sessions/sess-1/live', { method: 'POST', body: { status: 'idle' } });
  assert.equal(status(), 'scheduled');
  await call(env, '/api/planner/sessions/sess-1/live', { method: 'POST', body: { status: 'completed' } });
  assert.equal(status(), 'completed');
});

test('live: lectura heredada se mapea al formato del cliente', async () => {
  const { db, env } = await setup();
  await createMeeting(env, { id: 'sess-1' });
  db.run(
    `INSERT INTO planner_live_sessions (session_id, guild_id, channel_id, status, active_block_id, active_point_id,
       block_started_at, total_paused_ms, decisions_json, recordings_meta_json, updated_at, updated_by)
     VALUES ('sess-1', ?, ?, 'paused', 'b-1', 'p-2', 123, 40, '[{"id":"d"}]', '[]', '2026-01-01T00:00:00.000Z', 'u')`,
    GUILD, CHANNEL,
  );
  const { json } = await call(env, '/api/planner/sessions/sess-1/live');
  assert.equal(json.liveState.status, 'paused');
  assert.equal(json.liveState.liveActiveBlockId, 'b-1');
  assert.equal(json.liveState.liveActivePointId, 'p-2');
  assert.equal(json.liveState.activeBlockStartedAt, 123);
  assert.equal(json.liveState.accumulatedPausedMs, 40);
  assert.equal(json.liveState.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(json.liveState.decisions, [{ id: 'd' }]);
});

test('live: está acotado a guild+canal y responde 404 (no 500) si la reunión no existe', async () => {
  const { db, env } = await setup();
  await createMeeting(env, { id: 'sess-1' });
  await call(env, '/api/planner/sessions/sess-1/live', { method: 'POST', body: { status: 'running', decisions: [{ id: 'secreto' }] } });

  for (const token of ['token-b', 'token-x']) {
    assert.equal((await call(env, '/api/planner/sessions/sess-1/live', { token })).status, 404);
    const write = await call(env, '/api/planner/sessions/sess-1/live', { method: 'POST', token, body: { status: 'idle', decisions: [] } });
    assert.equal(write.status, 404);
  }
  assert.match(db.row("SELECT state_json FROM planner_live_sessions WHERE session_id = 'sess-1'").state_json, /secreto/);

  const missing = await call(env, '/api/planner/sessions/no-existe/live', { method: 'POST', body: { status: 'running' } });
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error, 'not_found');
});

test('live: rechaza estados de más de 512 KB', async () => {
  const { env } = await setup();
  await createMeeting(env, { id: 'sess-1' });
  const { status, json } = await call(env, '/api/planner/sessions/sess-1/live', {
    method: 'POST',
    body: { status: 'running', decisions: [{ content: 'x'.repeat(600 * 1024) }] },
  });
  assert.equal(status, 413);
  assert.equal(json.error, 'too_large');
});

test('DELETE /permanent de otro canal no borra la reunión ni su estado en vivo', async () => {
  const { db, env } = await setup();
  await createMeeting(env, { id: 'sess-1' });
  await call(env, '/api/planner/sessions/sess-1/live', { method: 'POST', body: { status: 'running', decisions: [{ id: 'd-1' }] } });

  for (const token of ['token-b', 'token-x']) {
    const res = await call(env, '/api/planner/sessions/sess-1/permanent', { method: 'DELETE', token });
    assert.equal(res.status, 404);
  }
  assert.ok(db.row("SELECT 1 AS ok FROM planner_sessions WHERE id = 'sess-1'"));
  assert.ok(db.row("SELECT 1 AS ok FROM planner_live_sessions WHERE session_id = 'sess-1'"));

  const own = await call(env, '/api/planner/sessions/sess-1/permanent', { method: 'DELETE' });
  assert.equal(own.status, 200);
  assert.equal(db.row("SELECT COUNT(*) AS n FROM planner_live_sessions WHERE session_id = 'sess-1'").n, 0);
});

test('DELETE archiva y restore recupera la reunión', async () => {
  const { db, env } = await setup();
  const created = await createMeeting(env);
  const del = await call(env, `/api/planner/sessions/${created.json.id}`, { method: 'DELETE' });
  assert.deepEqual(del.json, { ok: true, archived: true, id: created.json.id });
  const archived = await call(env, '/api/planner/sessions?archived=1');
  assert.equal(archived.json.sessions.length, 1);
  await call(env, `/api/planner/sessions/${created.json.id}/restore`, { method: 'POST' });
  assert.equal(db.row('SELECT status FROM planner_sessions WHERE id = ?', created.json.id).status, 'scheduled');
});

test('archivar y restaurar no cambian updatedAt: el PATCH siguiente con la base original no es un conflicto falso', async () => {
  const { env } = await setup();
  const created = await createMeeting(env, { id: 'sess-1' });
  const base = created.json.updatedAt;
  await call(env, '/api/planner/sessions/sess-1', { method: 'DELETE' });
  await call(env, '/api/planner/sessions/sess-1/restore', { method: 'POST' });
  const patch = await call(env, '/api/planner/sessions/sess-1', { method: 'PATCH', body: { title: 'Editada tras restaurar', baseUpdatedAt: base } });
  assert.equal(patch.status, 200);
  assert.equal(patch.json.session.title, 'Editada tras restaurar');
});

test('un 5xx de Discord responde 503 discord_unavailable', async () => {
  const { env } = await setup();
  env.DISCORD_FETCH = createDiscordFetch({ fail: 502 });
  const { status, json } = await call(env, '/api/planner/sessions');
  assert.equal(status, 503);
  assert.equal(json.error, 'discord_unavailable');
});

test('channel-context responde 503 (no un contexto vacío) si Discord no está disponible', async () => {
  const { env } = await setup();
  env.DISCORD_FETCH = createDiscordFetch({ fail: 429 });
  const { status, json } = await call(env, '/api/discord/channel-context');
  assert.equal(status, 503);
  assert.equal(json.error, 'discord_unavailable');
});

test('un id con codificación inválida responde 400 en vez de lanzar', async () => {
  const { env } = await setup();
  const { status } = await call(env, '/api/planner/sessions/%E0%A4%A');
  assert.equal(status, 400);
});
