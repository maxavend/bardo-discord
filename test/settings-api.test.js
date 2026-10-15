import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSettingsApi} from '../src/settings-api.js';
import {handlePlannerApi} from '../src/planner-api.js';
import {resolveSettings} from '../src/settings-db.js';
import {ASSIGNEE, setupKanban} from './helpers/kanban.js';
import {CHANNEL, authHeaders} from './helpers/sqlite-d1.js';

const bits = list => list.reduce((total, bit) => total | (1n << BigInt(bit)), 0n).toString();
// Ver canal, enviar mensajes y los de hilos: lo mínimo para usar Bardo y su bot.
const MEMBER = bits([10, 11, 35, 38]);
const CHANNEL_MANAGER = bits([4, 10, 11, 35, 38]);
const SERVER_MANAGER = bits([5, 10, 11, 35, 38]);

async function settingsEnv(permissions) {
  const k = await setupKanban({permissions});
  const call = async (path, {method = 'GET', body} = {}) => {
    const request = new Request(`https://bardo.test/api/settings${path}`, {
      method,
      headers: {...authHeaders(), ...(body ? {'Content-Type': 'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined,
    });
    const response = await handleSettingsApi(request, new URL(request.url), k.env);
    return {status: response.status, json: await response.json()};
  };
  return {...k, settings: call};
}

test('resolveSettings: el espacio pisa al servidor y el servidor a los valores por defecto', () => {
  const defaults = {timeZone: 'America/Santiago', taskChannelNotices: true, taskDmNotices: true};
  const result = resolveSettings({timeZone: 'America/Bogota', taskChannelNotices: false, taskDmNotices: null},
    {timeZone: null, taskChannelNotices: true, taskDmNotices: null}, defaults);
  assert.equal(result.timeZone, 'America/Bogota');
  assert.equal(result.taskChannelNotices, true);
  assert.equal(result.taskDmNotices, true);
  assert.deepEqual(result.sources, {timeZone: 'server', taskChannelNotices: 'space', taskDmNotices: 'default'});
});

test('un miembro ve los ajustes, cambia los personales y no puede tocar los del espacio ni del servidor', async () => {
  const k = await settingsEnv(MEMBER);
  const {status, json} = await k.settings('');
  assert.equal(status, 200);
  assert.deepEqual(json.permissions, {canEditServer: false, canEditSpace: false});
  assert.equal(json.effective.timeZone, 'America/Santiago');
  assert.equal(json.personal.taskDmNotices, true);
  assert.deepEqual(json.bot.checks.map(check => [check.id, check.ok]), [['messages', true], ['threads', true], ['dm', null]]);

  assert.equal((await k.settings('/personal', {method: 'PATCH', body: {taskDmNotices: false}})).json.personal.taskDmNotices, false);
  assert.equal((await k.settings('/space', {method: 'PATCH', body: {name: 'Equipo'}})).status, 403);
  assert.equal((await k.settings('/server', {method: 'PATCH', body: {taskDmNotices: false}})).status, 403);
});

test('quien gestiona el canal cambia el espacio (nombre, zona horaria, avisos) pero no el servidor', async () => {
  const k = await settingsEnv(CHANNEL_MANAGER);
  const saved = await k.settings('/space', {method: 'PATCH', body: {name: '  Equipo  Producto ', timeZone: 'America/Bogota', taskChannelNotices: false}});
  assert.equal(saved.status, 200);
  assert.equal(saved.json.space.name, 'Equipo Producto');
  assert.equal(saved.json.effective.timeZone, 'America/Bogota');
  assert.equal(saved.json.effective.sources.timeZone, 'space');
  assert.equal(saved.json.effective.taskChannelNotices, false);
  assert.equal((await k.settings('/space', {method: 'PATCH', body: {timeZone: 'Marte/Base'}})).status, 422);
  assert.equal((await k.settings('/space', {method: 'PATCH', body: {name: 'x'.repeat(61)}})).status, 422);
  // null vuelve a heredar del servidor.
  const inherited = await k.settings('/space', {method: 'PATCH', body: {timeZone: null, taskChannelNotices: null}});
  assert.equal(inherited.json.effective.sources.timeZone, 'default');
  assert.equal(inherited.json.effective.taskChannelNotices, true);
  assert.equal((await k.settings('/server', {method: 'PATCH', body: {timeZone: 'Europe/Madrid'}})).status, 403);
});

test('quien administra el servidor define los valores por defecto de todos los canales', async () => {
  const k = await settingsEnv(SERVER_MANAGER);
  const saved = await k.settings('/server', {method: 'PATCH', body: {timeZone: 'Europe/Madrid', taskDmNotices: false}});
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.permissions, {canEditServer: true, canEditSpace: true});
  assert.equal(saved.json.effective.timeZone, 'Europe/Madrid');
  assert.equal(saved.json.effective.sources.timeZone, 'server');
  assert.equal(saved.json.effective.taskDmNotices, false);
});

test('la zona horaria detectada solo se guarda si el servidor no tiene una', async () => {
  const k = await settingsEnv(MEMBER);
  assert.equal((await k.settings('/detected-time-zone', {method: 'POST', body: {timeZone: 'America/Lima'}})).json.saved, true);
  assert.equal((await k.settings('/detected-time-zone', {method: 'POST', body: {timeZone: 'Asia/Tokyo'}})).json.saved, false);
  const {json} = await k.settings('');
  assert.equal(json.effective.timeZone, 'America/Lima');
  assert.equal(json.server.timeZoneDetected, true);
  const context = await handlePlannerApi(
    new Request('https://bardo.test/api/discord/channel-context', {headers: authHeaders()}),
    new URL('https://bardo.test/api/discord/channel-context'), k.env);
  assert.equal((await context.json()).timeZone, 'America/Lima');
});

test('los avisos respetan los ajustes: sin canal, sin MD del espacio y sin MD personales', async () => {
  const k = await settingsEnv(CHANNEL_MANAGER);
  const channelPosts = () => k.discord.sent.filter(call => call.path === `/channels/${CHANNEL}/messages`).length;
  const dmOpens = () => k.discord.sent.filter(call => call.path === '/users/@me/channels').length;

  await k.settings('/space', {method: 'PATCH', body: {taskChannelNotices: false}});
  await k.createCard({title: 'Sin aviso en canal', assigneeId: ASSIGNEE, assigneeName: 'Ana'});
  await k.flush();
  assert.equal(channelPosts(), 0);
  assert.equal(dmOpens(), 1, 'el MD sigue activo');

  await k.settings('/space', {method: 'PATCH', body: {taskDmNotices: false}});
  await k.createCard({title: 'Sin avisos', assigneeId: ASSIGNEE, assigneeName: 'Ana'});
  await k.flush();
  assert.equal(dmOpens(), 1);

  await k.settings('/space', {method: 'PATCH', body: {taskChannelNotices: null, taskDmNotices: null}});
  k.db.run("INSERT INTO user_settings (user_id, task_dm_notices, updated_at) VALUES (?, 0, '2026-10-15')", ASSIGNEE);
  await k.createCard({title: 'Persona sin MD', assigneeId: ASSIGNEE, assigneeName: 'Ana'});
  await k.flush();
  assert.equal(channelPosts(), 1, 'vuelve el aviso en el canal');
  assert.equal(dmOpens(), 1, 'Ana pidió no recibir MD');
});
