// Comandos de Discord (/bardo, /docs, /ayuda, /reu-new) y destinos de lanzamiento.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { isValidIsoDate, isValidTime } from '../src/worker.js';
import { generateKeyPairSync, sign } from 'node:crypto';
import { buildDocsListPayload, buildHelpPayload, newDocCustomId } from '../src/components.js';
import { allCommands } from '../scripts/command-definitions.js';
import {
  CHANNEL,
  GUILD,
  USER,
  authHeaders,
  createEnv,
  createTestDb,
  insertDocument,
  insertSession,
} from './helpers/sqlite-d1.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');

function signedInteraction(payload) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(payload);
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]), privateKey).toString('hex');
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp, 'content-type': 'application/json' },
    body,
  });
}

async function setup() {
  const db = createTestDb();
  await insertSession(db);
  const pending = [];
  const ctx = { waitUntil: (promise) => pending.push(promise) };
  const env = { DISCORD_PUBLIC_KEY: PUBLIC_KEY, ...createEnv(db) };
  const send = async (payload) => {
    const res = await worker.fetch(signedInteraction(payload), env, ctx);
    await Promise.all(pending.splice(0));
    return res.json();
  };
  return { db, env, send };
}

const command = (name, options = [], extra = {}) => ({
  type: 2,
  guild_id: GUILD,
  channel_id: CHANNEL,
  member: { user: { id: USER, username: 'tester' } },
  data: { name, options },
  ...extra,
});

const button = (customId) => ({
  type: 3,
  guild_id: GUILD,
  channel_id: CHANNEL,
  member: { user: { id: USER, username: 'tester' } },
  data: { custom_id: customId },
});

async function launchTargetFromLibrary(env) {
  const res = await worker.fetch(new Request('http://localhost/api/docs', { headers: authHeaders() }), env);
  return (await res.json()).launchTarget;
}

test('los comandos registrados incluyen abrir, documentos, reuniones y ayuda', () => {
  const names = allCommands.map((cmd) => cmd.toJSON().name);
  for (const name of ['bardo', 'doc-new', 'doc-upload', 'docs', 'reu-new', 'reus', 'ayuda', 'upload-docs']) {
    assert.ok(names.includes(name), `falta /${name}`);
  }
  const bardo = allCommands.find((cmd) => cmd.toJSON().name === 'bardo').toJSON();
  assert.deepEqual(bardo.options[0].choices.map((c) => c.value), ['docs', 'reuniones', 'nuevo']);
});

test('/bardo abre la Activity (LAUNCH_ACTIVITY) y la biblioteca recibe el destino una sola vez', async () => {
  const { env, send } = await setup();
  const res = await send(command('bardo', [{ name: 'seccion', value: 'reuniones' }]));
  assert.equal(res.type, 12);
  assert.equal(await launchTargetFromLibrary(env), 'planner');
  assert.equal(await launchTargetFromLibrary(env), null, 'el destino se consume al leerlo');
});

test('/bardo sin sección abre la biblioteca; "nuevo" abre el editor', async () => {
  const { env, send } = await setup();
  await send(command('bardo'));
  assert.equal(await launchTargetFromLibrary(env), 'docs');
  await send(command('bardo', [{ name: 'seccion', value: 'nuevo' }]));
  assert.equal(await launchTargetFromLibrary(env), 'new-doc');
});

test('/bardo fuera de un servidor responde un aviso efímero', async () => {
  const { send } = await setup();
  const res = await send(command('bardo', [], { guild_id: undefined, channel_id: undefined }));
  assert.equal(res.type, 4);
  assert.equal(res.data.flags & 64, 64);
});

test('botones especiales guardan su destino: "Abrir Reuniones" gana a un documento abierto antes (móvil)', async () => {
  const { db, env, send } = await setup();
  insertDocument(db, { id: 'doc-1', title: 'Doc Uno', createdBy: USER, guildId: GUILD, channelId: CHANNEL });
  await send(button('bardo:open:doc-1'));
  const res = await send(button('bardo:open:planner'));
  assert.equal(res.type, 12);
  assert.equal(await launchTargetFromLibrary(env), 'planner');
});

test('el botón de una reunión lleva a esa reunión y las tarjetas antiguas de /doc-new conservan el título', async () => {
  const { env, send } = await setup();
  await send(button('bardo:open:planner-session:sess-42'));
  assert.equal(await launchTargetFromLibrary(env), 'planner-session:sess-42');
  // Cards posted before /doc-new created the document still open a blank editor.
  await send(button(newDocCustomId('Plan Q4')));
  assert.equal(await launchTargetFromLibrary(env), 'new-doc:Plan Q4');
});

test('/doc-new crea el documento y su botón lleva al editor de ese documento', async () => {
  const { db, env, send } = await setup();
  const res = await send(command('doc-new', [{ name: 'titulo', value: 'Plan Q4' }]));
  assert.equal(res.type, 4);
  const { id } = db.row("SELECT id FROM documents WHERE title = 'Plan Q4'");
  const customId = res.data.components[0].components.at(-1).components[0].custom_id;
  assert.equal(customId, `bardo:open:edit:${id}`);
  assert.equal((await send(button(customId))).type, 12);
  assert.equal(await launchTargetFromLibrary(env), `edit:${id}`);
});

test('newDocCustomId respeta el límite de 100 caracteres de Discord, también con tildes y emoji', () => {
  assert.equal(newDocCustomId(), 'bardo:open:new-doc');
  const long = newDocCustomId('Ñandú 🚀 '.repeat(40));
  assert.ok(Array.from(long).length <= 100);
  assert.ok(long.startsWith('bardo:open:new-doc:Ñandú 🚀'));
});

test('/docs lista los documentos del canal con botones para abrir los primeros cinco', async () => {
  const { db, send } = await setup();
  for (let i = 1; i <= 7; i += 1) {
    insertDocument(db, { id: `doc-${i}`, title: `Documento ${i}`, createdBy: USER, guildId: GUILD, channelId: CHANNEL });
  }
  const res = await send(command('docs'));
  assert.equal(res.type, 4);
  const json = JSON.stringify(res.data);
  for (let i = 1; i <= 7; i += 1) assert.ok(json.includes(`Documento ${i}`));
  const openIds = json.match(/bardo:open:doc-\d/g) || [];
  assert.equal(openIds.length, 5);
});

test('/docs sin documentos sugiere /doc-new y /doc-upload', () => {
  const json = JSON.stringify(buildDocsListPayload({ documents: [] }));
  assert.ok(json.includes('/doc-new'));
  assert.ok(json.includes('/doc-upload'));
});

test('/ayuda responde efímero con todos los comandos', async () => {
  const { send } = await setup();
  const res = await send(command('ayuda'));
  assert.equal(res.type, 4);
  assert.equal(res.data.flags & 64, 64);
  const json = JSON.stringify(res.data);
  for (const name of ['/bardo', '/doc-new', '/doc-upload', '/docs', '/reu-new', '/reus']) assert.ok(json.includes(name));
  assert.deepEqual(buildHelpPayload().flags & 64, 64);
});

test('/reu-new rechaza fechas y horas inválidas sin crear la reunión', async () => {
  const { db, send } = await setup();
  const badDate = await send(command('reu-new', [{ name: 'titulo', value: 'Sprint' }, { name: 'fecha', value: '2026-02-30' }]));
  assert.equal(badDate.data.flags & 64, 64);
  assert.match(badDate.data.content, /AAAA-MM-DD/);
  const badTime = await send(command('reu-new', [{ name: 'titulo', value: 'Sprint' }, { name: 'hora', value: '25:00' }]));
  assert.match(badTime.data.content, /HH:MM/);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM planner_sessions').n, 0);
});

test('/reu-new sin fecha usa el día de hoy en America/Santiago', async () => {
  const { db, send } = await setup();
  await send(command('reu-new', [{ name: 'titulo', value: 'Daily' }]));
  const expected = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  assert.equal(db.row('SELECT date FROM planner_sessions').date, expected);
});

test('validadores de fecha y hora', () => {
  assert.ok(isValidIsoDate('2026-10-07'));
  assert.ok(isValidIsoDate('2028-02-29'));
  assert.ok(!isValidIsoDate('2026-02-29'));
  assert.ok(!isValidIsoDate('07-10-2026'));
  assert.ok(isValidTime('00:00'));
  assert.ok(isValidTime('23:59'));
  assert.ok(!isValidTime('24:00'));
  assert.ok(!isValidTime('9:30'));
});
