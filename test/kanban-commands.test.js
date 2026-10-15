// /tarea, /tareas y los botones que abren el tablero o una tarjeta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import worker, {parseTaskDueDate} from '../src/worker.js';
import {ASSIGNEE, OUTSIDER, createKanbanDiscord} from './helpers/kanban.js';
import {CHANNEL, GUILD, USER, authHeaders, createEnv, createTestDb, insertSession} from './helpers/sqlite-d1.js';

const {publicKey, privateKey} = generateKeyPairSync('ed25519');
const PUBLIC_KEY = publicKey.export({type: 'spki', format: 'der'}).subarray(-32).toString('hex');

function signedInteraction(payload) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(payload);
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]), privateKey).toString('hex');
  return new Request('http://localhost/', {
    method: 'POST',
    headers: {'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp, 'content-type': 'application/json'},
    body,
  });
}

async function setup() {
  const db = createTestDb();
  await insertSession(db);
  const discord = createKanbanDiscord();
  const pending = [];
  const ctx = {waitUntil: promise => pending.push(promise)};
  const env = {DISCORD_PUBLIC_KEY: PUBLIC_KEY, ...createEnv(db, {DISCORD_FETCH: discord.fetchImpl, DISCORD_PERMISSION_CACHE_TTL_MS: 0})};
  const send = async payload => {
    const res = await worker.fetch(signedInteraction(payload), env, ctx);
    while (pending.length) await Promise.all(pending.splice(0));
    return res.json();
  };
  return {db, env, discord, send};
}

let interactionCounter = 0;
const command = (name, options = [], resolved = undefined) => ({
  id: `interaction-${++interactionCounter}`,
  application_id: 'app-1',
  token: 'interaction-token',
  type: 2,
  guild_id: GUILD,
  channel_id: CHANNEL,
  member: {user: {id: USER, username: 'tester', global_name: 'Tester'}},
  data: {name, options, ...(resolved ? {resolved} : {})},
});

const member = (id, name, permissions) => ({
  users: {[id]: {id, username: name.toLowerCase(), global_name: name}},
  members: {[id]: {nick: null, ...(permissions === undefined ? {} : {permissions})}},
});

test('parseTaskDueDate entiende hoy, mañana y AAAA-MM-DD', () => {
  assert.equal(parseTaskDueDate(''), null);
  assert.match(parseTaskDueDate('hoy'), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(parseTaskDueDate('mañana') > parseTaskDueDate('hoy'));
  assert.equal(parseTaskDueDate('Manana'), parseTaskDueDate('mañana'));
  assert.equal(parseTaskDueDate('2026-10-20'), '2026-10-20');
  assert.equal(parseTaskDueDate('20-10-2026'), false);
});

test('/tarea crea la tarjeta, responde en público mencionando al responsable y le manda un MD', async () => {
  const {db, discord, send} = await setup();
  const res = await send(command('tarea', [
    {name: 'titulo', value: 'Subir presupuesto'},
    {name: 'responsable', value: ASSIGNEE},
    {name: 'fecha', value: '2026-10-20'},
  ], member(ASSIGNEE, 'Ana', '1024')));

  assert.equal(res.type, 4);
  assert.equal(res.data.flags & 64, 0, 'es pública');
  assert.deepEqual(res.data.allowed_mentions.users, [ASSIGNEE]);
  const card = db.row('SELECT * FROM kanban_cards');
  assert.equal(card.title, 'Subir presupuesto');
  assert.equal(card.assignee_id, ASSIGNEE);
  assert.equal(card.assignee_name, 'Ana');
  assert.equal(card.due_date, '2026-10-20');
  assert.ok(JSON.stringify(res.data).includes(`bardo:open:kanban-card:${card.id}`));
  assert.ok(JSON.stringify(res.data).includes('Tester creó esta tarea'));

  // El aviso del canal es la propia respuesta: no se publica otro mensaje.
  assert.equal(discord.sent.filter(call => call.path === `/channels/${CHANNEL}/messages`).length, 0);
  assert.equal(discord.sent.filter(call => call.path === '/users/@me/channels').length, 1);
  assert.equal(db.row('SELECT message_id FROM kanban_cards').message_id, 'original-msg');
  const dm = discord.sent.find(call => call.path === `/channels/dm-${ASSIGNEE}/messages`);
  assert.ok(JSON.stringify(dm.body).includes('original-msg'), 'el MD enlaza al aviso del canal');
});

test('/tarea es idempotente si Discord reintenta la misma interacción', async () => {
  const {db, send} = await setup();
  const payload = command('tarea', [{name: 'titulo', value: 'Una vez'}]);
  await send(payload);
  await send(payload);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM kanban_cards').n, 1);
});

test('/tarea para uno mismo no menciona ni manda MD', async () => {
  const {discord, send} = await setup();
  const res = await send(command('tarea', [{name: 'titulo', value: 'Mía'}, {name: 'responsable', value: USER}], member(USER, 'Tester', '1024')));
  assert.deepEqual(res.data.allowed_mentions.users, []);
  assert.equal(discord.sent.length, 0);
});

test('/tarea rechaza fechas inválidas, bots y responsables que no ven el canal', async () => {
  const {db, send} = await setup();
  const badDate = await send(command('tarea', [{name: 'titulo', value: 'x'}, {name: 'fecha', value: 'pasado'}]));
  assert.equal(badDate.data.flags & 64, 64);
  assert.match(badDate.data.content, /AAAA-MM-DD/);

  const bot = await send(command('tarea', [{name: 'titulo', value: 'x'}, {name: 'responsable', value: '555555555'}], {
    users: {555555555: {id: '555555555', username: 'robot', bot: true}}, members: {},
  }));
  assert.match(bot.data.content, /no a un bot/);

  const hidden = await send(command('tarea', [{name: 'titulo', value: 'x'}, {name: 'responsable', value: OUTSIDER}], member(OUTSIDER, 'Fuera', '0')));
  assert.match(hidden.data.content, /no puede ver este canal/);

  // Sin permisos en el payload, se calculan con la API de Discord.
  const computed = await send(command('tarea', [{name: 'titulo', value: 'x'}, {name: 'responsable', value: OUTSIDER}], member(OUTSIDER, 'Fuera')));
  assert.match(computed.data.content, /no puede ver este canal/);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM kanban_cards').n, 0);
});

test('/tareas es efímero, excluye "Hecho" y archivadas, y con mias:true filtra', async () => {
  const {db, send} = await setup();
  const empty = await send(command('tareas'));
  assert.equal(empty.data.flags & 64, 64);
  assert.ok(JSON.stringify(empty.data).includes('/tarea'));

  await send(command('tarea', [{name: 'titulo', value: 'Abierta mía'}, {name: 'responsable', value: USER}], member(USER, 'Tester', '1024')));
  await send(command('tarea', [{name: 'titulo', value: 'Abierta de Ana'}, {name: 'responsable', value: ASSIGNEE}], member(ASSIGNEE, 'Ana', '1024')));
  await send(command('tarea', [{name: 'titulo', value: 'Terminada'}]));
  await send(command('tarea', [{name: 'titulo', value: 'Archivada'}]));
  const done = db.row('SELECT id FROM kanban_columns WHERE is_done = 1').id;
  db.run("UPDATE kanban_cards SET column_id = ? WHERE title = 'Terminada'", done);
  db.run("UPDATE kanban_cards SET archived_at = '2026-01-01' WHERE title = 'Archivada'");

  const all = JSON.stringify((await send(command('tareas'))).data);
  assert.ok(all.includes('Abierta mía') && all.includes('Abierta de Ana'));
  assert.ok(!all.includes('Terminada') && !all.includes('Archivada'));
  assert.ok(all.includes('bardo:open:kanban'));

  const mine = JSON.stringify((await send(command('tareas', [{name: 'mias', value: true}]))).data);
  assert.ok(mine.includes('Abierta mía'));
  assert.ok(!mine.includes('Abierta de Ana'));
});

test('los botones "Abrir tablero" y "Abrir tarjeta" lanzan la Activity con su destino', async () => {
  const {env, send} = await setup();
  const button = customId => ({
    type: 3, guild_id: GUILD, channel_id: CHANNEL,
    member: {user: {id: USER, username: 'tester'}}, data: {custom_id: customId},
  });
  const launchTarget = async () => {
    const res = await worker.fetch(new Request('http://localhost/api/docs', {headers: authHeaders()}), env);
    return (await res.json()).launchTarget;
  };
  assert.equal((await send(button('bardo:open:kanban'))).type, 12);
  assert.equal(await launchTarget(), 'kanban');
  assert.equal((await send(button('bardo:open:kanban-card:abc-123'))).type, 12);
  assert.equal(await launchTarget(), 'kanban-card:abc-123');
});

test('/tarea respeta los ajustes del espacio: sin mención si los avisos del canal están apagados y «hoy» en su zona horaria', async () => {
  const {db, send} = await setup();
  db.run(`INSERT INTO channel_settings (guild_id, channel_id, time_zone, task_channel_notices, updated_at, updated_by)
    VALUES (?, ?, 'Pacific/Kiritimati', 0, '2026-10-15', 'admin')`, GUILD, CHANNEL);
  const res = await send(command('tarea', [
    {name: 'titulo', value: 'Sin mención'},
    {name: 'responsable', value: ASSIGNEE},
    {name: 'fecha', value: 'hoy'},
  ], member(ASSIGNEE, 'Ana', '1024')));
  assert.deepEqual(res.data.allowed_mentions.users, []);
  const expected = new Intl.DateTimeFormat('en-CA', {timeZone: 'Pacific/Kiritimati', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  assert.equal(db.row('SELECT due_date FROM kanban_cards').due_date, expected);
  assert.equal(db.row("SELECT COUNT(*) AS n FROM kanban_notifications WHERE kind = 'channel'").n, 0);
});
