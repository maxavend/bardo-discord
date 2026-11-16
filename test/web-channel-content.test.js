import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {summarizeChannelContent} from '../src/web-channel-content.js';
import {CHANNEL, GUILD, USER, insertDocument, createTestDb} from './helpers/sqlite-d1.js';
import {PRIVATE_CHANNEL, createBrowser, createWebEnv} from './helpers/web-fixtures.js';

const CREATED = '2026-10-01T10:00:00.000Z';
const UPDATED = '2026-10-02T10:00:00.000Z';
const LATEST = '2026-10-03T10:00:00.000Z';
const endpoint = guild => `/api/web/channel-content?guild_id=${encodeURIComponent(guild)}`;
const empty = id => ({id, documents: 0, meetings: 0, tasks: 0, updatedAt: null});

function meeting(db, id, {guildId = GUILD, channelId = CHANNEL, status = 'scheduled', updatedAt = UPDATED, liveAt = null} = {}) {
  db.run(`INSERT INTO planner_sessions
    (id, guild_id, channel_id, title, date, start_time, target_duration, blocks_json, status, created_at, created_by, updated_at, updated_by)
    VALUES (?, ?, ?, 'Reunión', '2026-10-01', '10:00', 30, '[]', ?, ?, ?, ?, ?)`,
  id, guildId, channelId, status, CREATED, USER, updatedAt, USER);
  if (liveAt) db.run(`INSERT INTO planner_live_sessions (session_id, guild_id, channel_id, status, updated_at, updated_by)
    VALUES (?, ?, ?, 'ended', ?, ?)`, id, guildId, channelId, liveAt, USER);
}

function board(db, id, {guildId = GUILD, channelId = CHANNEL} = {}) {
  db.run(`INSERT INTO kanban_boards (id, guild_id, channel_id, created_at, created_by, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, id, guildId, channelId, CREATED, USER, LATEST, USER);
  db.run(`INSERT INTO kanban_columns (id, board_id, name, position, created_at, updated_at)
    VALUES (?, ?, 'Por hacer', 0, ?, ?)`, `column-${id}`, id, CREATED, CREATED);
}

function card(db, id, boardId, {archivedAt = null, completedAt = null, updatedAt = UPDATED} = {}) {
  const number = Number(db.row('SELECT COUNT(*) AS n FROM kanban_cards WHERE board_id = ?', boardId).n) + 1;
  db.run(`INSERT INTO kanban_cards
    (id, board_id, column_id, number, rank, title, archived_at, completed_at, created_at, created_by, updated_at, updated_by)
    VALUES (?, ?, ?, ?, 'a', 'Tarea', ?, ?, ?, ?, ?, ?)`,
  id, boardId, `column-${boardId}`, number, archivedAt, completedAt, CREATED, USER, updatedAt, USER);
}

test('el resumen requiere sesión, valida servidor y permite solo GET', async () => {
  const {env} = createWebEnv();
  const browser = createBrowser(worker, env);
  assert.equal((await browser.fetch(endpoint(GUILD))).status, 401);
  await browser.login();
  for (const path of ['/api/web/channel-content', endpoint('../otro')]) {
    assert.equal((await browser.fetch(path)).status, 400);
  }
  assert.equal((await browser.fetch(endpoint(GUILD), {method: 'POST'})).status, 405);
  assert.equal((await browser.fetch(endpoint('guild-ajeno'))).status, 403);
});

test('resume solo contenido de canales autorizados; excluye archivos y documentos personales', async () => {
  const {db, env, calls} = createWebEnv();
  insertDocument(db, {id: 'document-visible', updatedAt: UPDATED});
  insertDocument(db, {id: 'document-archived', archivedAt: LATEST});
  insertDocument(db, {id: 'document-private-channel', channelIds: [PRIVATE_CHANNEL]});
  insertDocument(db, {id: 'document-other-guild', guildId: 'guild-ajeno', channelIds: [CHANNEL]});
  insertDocument(db, {id: 'personal-with-incorrect-acl'});
  db.run(`INSERT INTO personal_documents (document_id, owner_id, created_at, updated_at)
    VALUES ('personal-with-incorrect-acl', ?, ?, ?)`, USER, CREATED, LATEST);
  meeting(db, 'meeting-visible', {liveAt: LATEST});
  meeting(db, 'meeting-archived', {status: 'archived'});
  meeting(db, 'meeting-private', {channelId: PRIVATE_CHANNEL});
  meeting(db, 'meeting-other-guild', {guildId: 'guild-ajeno'});
  board(db, 'board-visible');
  card(db, 'task-open', 'board-visible');
  card(db, 'task-completed', 'board-visible', {completedAt: UPDATED});
  card(db, 'task-archived', 'board-visible', {archivedAt: LATEST});
  board(db, 'board-private', {channelId: PRIVATE_CHANNEL});
  card(db, 'task-private', 'board-private');
  board(db, 'board-other', {guildId: 'guild-ajeno'});
  card(db, 'task-other', 'board-other');

  const browser = createBrowser(worker, env);
  await browser.login();
  db.queries.length = 0;
  calls.length = 0;
  const response = await browser.fetch(`${endpoint(GUILD)}&channel_ids=${PRIVATE_CHANNEL}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), {guildId: GUILD, channels: [
    {id: CHANNEL, documents: 1, meetings: 1, tasks: 2, updatedAt: Date.parse(LATEST)},
  ]});
  assert.equal(db.queries.filter(sql => sql.startsWith('WITH allowed')).length, 1);
  assert.ok(db.queries.every(sql => /^\s*(SELECT|WITH)\b/i.test(sql)), 'la consulta no crea tableros ni modifica contenido');
  assert.equal(calls.length, 4, 'solo miembro, servidor, roles y lista de canales; sin llamadas por canal');
  assert.ok(!calls.some(call => call.includes('/users/@me/guilds')));
});

test('un tablero vacío no convierte el canal en un canal con contenido', async () => {
  const {db, env} = createWebEnv();
  board(db, 'empty-board');
  const browser = createBrowser(worker, env);
  await browser.login();
  assert.deepEqual(await (await browser.fetch(endpoint(GUILD))).json(), {guildId: GUILD, channels: [empty(CHANNEL)]});
  assert.equal(db.row('SELECT COUNT(*) AS n FROM kanban_boards').n, 1);
});

test('sin tablero devuelve ceros sin crear datos y un servidor sin canales devuelve una lista vacía', async () => {
  const {db, env} = createWebEnv();
  const browser = createBrowser(worker, env);
  await browser.login();
  assert.deepEqual(await (await browser.fetch(endpoint(GUILD))).json(), {guildId: GUILD, channels: [empty(CHANNEL)]});
  assert.equal(db.row('SELECT COUNT(*) AS n FROM kanban_boards').n, 0);
  const baseFetch = env.DISCORD_FETCH;
  env.DISCORD_FETCH = (input, init) => new URL(input).pathname === `/api/v10/guilds/${GUILD}/channels`
    ? Response.json([]) : baseFetch(input, init);
  assert.deepEqual(await (await browser.fetch(endpoint(GUILD))).json(), {guildId: GUILD, channels: []});
});

test('las fechas consideran compartir documentos, cambios en tareas y la reunión en vivo', async () => {
  const db = createTestDb();
  insertDocument(db, {id: 'shared-later', createdAt: CREATED, updatedAt: CREATED});
  db.run('UPDATE document_channel_access SET added_at = ? WHERE document_id = ?', UPDATED, 'shared-later');
  assert.equal((await summarizeChannelContent(db, GUILD, [CHANNEL]))[0].updatedAt, Date.parse(UPDATED));
  board(db, 'tasks');
  card(db, 'edited-task', 'tasks', {updatedAt: LATEST});
  assert.equal((await summarizeChannelContent(db, GUILD, [CHANNEL]))[0].updatedAt, Date.parse(LATEST));
  const liveAt = '2026-10-04T10:00:00.000Z';
  meeting(db, 'meeting-live', {updatedAt: CREATED, liveAt});
  assert.equal((await summarizeChannelContent(db, GUILD, [CHANNEL]))[0].updatedAt, Date.parse(liveAt));
});

test('divide servidores grandes en lecturas acotadas y conserva cada canal autorizado', async () => {
  const db = createTestDb();
  const channels = Array.from({length: 161}, (_, index) => `channel-${index}`);
  insertDocument(db, {id: 'last-channel', channelIds: [channels.at(-1)]});
  const summary = await summarizeChannelContent(db, GUILD, [...channels, channels[0]]);
  assert.equal(summary.length, channels.length);
  assert.equal(summary.at(-1).documents, 1);
  assert.deepEqual(summary[0], empty(channels[0]));
  assert.equal(db.queries.length, 3);
  assert.ok(db.queries.every(sql => (sql.match(/\?/g) || []).length <= 81));
});

test('el resumen vuelve a comprobar los permisos aunque el selector esté en caché', async () => {
  const {db, env} = createWebEnv({}, {DISCORD_PERMISSION_CACHE_TTL_MS: 60_000});
  insertDocument(db, {id: 'now-inaccessible'});
  const baseFetch = env.DISCORD_FETCH;
  let denied = false;
  env.DISCORD_FETCH = (input, init) => denied && new URL(input).pathname === `/api/v10/guilds/${GUILD}/roles`
    ? Response.json([{id: GUILD, permissions: '0'}]) : baseFetch(input, init);
  const browser = createBrowser(worker, env);
  await browser.login();
  assert.equal((await (await browser.fetch('/api/web/channels')).json()).guilds[0].channels.length, 1);
  denied = true;
  assert.deepEqual(await (await browser.fetch(endpoint(GUILD))).json(), {guildId: GUILD, channels: []});
});

test('Discord inaccesible o malformado produce un error recuperable, nunca ceros', async () => {
  for (const broken of [new Response('{}', {status: 503}), Response.json({unexpected: true})]) {
    const {env} = createWebEnv();
    const baseFetch = env.DISCORD_FETCH;
    env.DISCORD_FETCH = (input, init) => new URL(input).pathname === `/api/v10/guilds/${GUILD}/channels`
      ? broken.clone() : baseFetch(input, init);
    const browser = createBrowser(worker, env);
    await browser.login();
    const response = await browser.fetch(endpoint(GUILD));
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.error, 'discord_unavailable');
    assert.equal(payload.channels, undefined);
  }
});

test('un fallo de D1 produce resumen indisponible y no un canal vacío', async () => {
  const {db, env} = createWebEnv();
  const browser = createBrowser(worker, env);
  await browser.login();
  const prepare = db.prepare.bind(db);
  db.prepare = sql => {
    if (sql.startsWith('WITH allowed')) throw new Error('database unavailable');
    return prepare(sql);
  };
  const response = await browser.fetch(endpoint(GUILD));
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, 'content_unavailable');
  assert.equal(payload.channels, undefined);
});
