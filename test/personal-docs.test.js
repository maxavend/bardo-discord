// Documentos personales: de una persona, sin canal, con enlace opcional.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDocsApi } from '../src/docs-api.js';
import { adoptLegacyDocumentsForGuild } from '../src/db.js';
import { persistDocumentLaunchContext } from '../src/worker.js';
import {
  CHANNEL,
  GUILD,
  USER,
  authHeaders,
  createDiscordFetch,
  createEnv,
  createTestDb,
  insertDocument,
  insertSession,
} from './helpers/sqlite-d1.js';

const OTHER = 'user-456';
const OTHER_TOKEN = 'other-token';
const FAR_TOKEN = 'far-token';
const FAR_GUILD = 'guild-999';
const FAR_CHANNEL = 'channel-999';

async function setup() {
  const db = createTestDb();
  await insertSession(db);
  await insertSession(db, { token: OTHER_TOKEN, userId: OTHER, username: 'Otra' });
  // La misma persona del enlace, pero abriendo Bardo en otro servidor.
  await insertSession(db, { token: FAR_TOKEN, userId: OTHER, guildId: FAR_GUILD, channelId: FAR_CHANNEL, username: 'Otra' });
  insertDocument(db, { id: 'channel-doc', title: 'Del canal' });
  const env = createEnv(db, {
    DISCORD_FETCH: createDiscordFetch({ channels: { [CHANNEL]: GUILD, [FAR_CHANNEL]: FAR_GUILD } }),
  });
  return { db, env };
}

async function call(env, path, { method = 'GET', body, token, headers = {} } = {}) {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { ...authHeaders(token), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handleDocsApi(request, new URL(request.url), env);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* sin cuerpo JSON */ }
  return { status: response.status, json };
}

async function createPersonal(env, title = 'Mis notas') {
  const { status, json } = await call(env, '/api/docs', {
    method: 'POST',
    body: { title, markdown: `# ${title}\n\nPrivado`, space: 'personal' },
  });
  assert.equal(status, 201);
  return json.document;
}

test('un documento personal no recibe ACL de canal ni de servidor', async () => {
  const { db, env } = await setup();
  const doc = await createPersonal(env);
  assert.equal(doc.space, 'personal');
  assert.equal(doc.role, 'owner');
  assert.equal(doc.linkAccess, 'none');
  assert.equal(db.rows('SELECT * FROM document_channel_access WHERE document_id = ?', doc.id).length, 0);
  assert.equal(db.rows('SELECT * FROM document_guild_access WHERE document_id = ?', doc.id).length, 0);
  assert.equal(db.row('SELECT owner_id FROM personal_documents WHERE document_id = ?', doc.id).owner_id, USER);
});

test('la lista mezcla canal y personales, cada uno con su espacio', async () => {
  const { env } = await setup();
  const doc = await createPersonal(env);
  const { json } = await call(env, '/api/docs');
  const byId = Object.fromEntries(json.documents.map(item => [item.id, item]));
  assert.equal(byId['channel-doc'].space, 'channel');
  assert.equal(byId['channel-doc'].role, 'channel');
  assert.equal(byId[doc.id].space, 'personal');
  assert.equal(byId[doc.id].role, 'owner');
});

test('nadie más ve ni abre un documento personal con el enlace desactivado', async () => {
  const { env } = await setup();
  const doc = await createPersonal(env);
  const list = await call(env, '/api/docs', { token: OTHER_TOKEN });
  assert.ok(!list.json.documents.some(item => item.id === doc.id));
  assert.equal((await call(env, `/api/docs/${doc.id}`, { token: OTHER_TOKEN })).status, 403);
  assert.equal((await call(env, `/api/docs/${doc.id}/export-link`, { method: 'POST', token: OTHER_TOKEN, body: { format: 'md' } })).status, 403);
});

test('el enlace de lectura deja leer, no editar, y lo guarda en «Compartidos contigo»', async () => {
  const { env } = await setup();
  const doc = await createPersonal(env);
  const shared = await call(env, `/api/docs/${doc.id}/sharing`, { method: 'PATCH', body: { linkAccess: 'read' } });
  assert.equal(shared.status, 200);
  assert.equal(shared.json.document.linkAccess, 'read');

  // Desde otro servidor también: el espacio personal no depende del canal.
  const opened = await call(env, `/api/docs/${doc.id}`, { token: FAR_TOKEN });
  assert.equal(opened.status, 200);
  assert.equal(opened.json.role, 'viewer');
  assert.equal(opened.json.space, 'personal');

  const edit = await call(env, `/api/docs/${doc.id}`, { method: 'PATCH', token: OTHER_TOKEN, body: { markdown: '# Mío\n\nCambio' } });
  assert.equal(edit.status, 403);
  assert.equal(edit.json.error, 'read_only');

  const list = await call(env, '/api/docs', { token: OTHER_TOKEN });
  const entry = list.json.documents.find(item => item.id === doc.id);
  assert.equal(entry?.role, 'viewer');

  // Al desactivar el enlace, desaparece de su lista y ya no abre.
  await call(env, `/api/docs/${doc.id}/sharing`, { method: 'PATCH', body: { linkAccess: 'none' } });
  const after = await call(env, '/api/docs', { token: OTHER_TOKEN });
  assert.ok(!after.json.documents.some(item => item.id === doc.id));
  assert.equal((await call(env, `/api/docs/${doc.id}`, { token: OTHER_TOKEN })).status, 403);
});

test('el enlace de edición deja guardar cambios, pero no archivar ni compartir', async () => {
  const { env } = await setup();
  const doc = await createPersonal(env);
  await call(env, `/api/docs/${doc.id}/sharing`, { method: 'PATCH', body: { linkAccess: 'edit' } });

  const edit = await call(env, `/api/docs/${doc.id}`, { method: 'PATCH', token: OTHER_TOKEN, body: { markdown: '# Mis notas\n\nCon aporte' } });
  assert.equal(edit.status, 200);
  assert.equal(edit.json.document.role, 'editor');

  assert.equal((await call(env, `/api/docs/${doc.id}`, { method: 'DELETE', token: OTHER_TOKEN })).status, 403);
  assert.equal((await call(env, `/api/docs/${doc.id}/sharing`, { method: 'PATCH', token: OTHER_TOKEN, body: { linkAccess: 'none' } })).status, 403);
  assert.equal((await call(env, `/api/docs/${doc.id}/move`, { method: 'POST', token: OTHER_TOKEN })).status, 403);
});

test('el permiso del enlace solo acepta valores conocidos', async () => {
  const { env } = await setup();
  const doc = await createPersonal(env);
  const bad = await call(env, `/api/docs/${doc.id}/sharing`, { method: 'PATCH', body: { linkAccess: 'public' } });
  assert.equal(bad.status, 400);
  const channel = await call(env, '/api/docs/channel-doc/sharing', { method: 'PATCH', body: { linkAccess: 'read' } });
  assert.equal(channel.status, 409);
});

test('llevar un documento personal al canal lo vuelve del canal y borra el enlace', async () => {
  const { db, env } = await setup();
  const doc = await createPersonal(env);
  await call(env, `/api/docs/${doc.id}/sharing`, { method: 'PATCH', body: { linkAccess: 'read' } });
  await call(env, `/api/docs/${doc.id}`, { token: FAR_TOKEN });

  const moved = await call(env, `/api/docs/${doc.id}/move`, { method: 'POST' });
  assert.equal(moved.status, 200);
  assert.equal(moved.json.document.space, 'channel');
  assert.equal(db.rows('SELECT * FROM personal_documents WHERE document_id = ?', doc.id).length, 0);
  assert.equal(db.rows('SELECT * FROM personal_document_visitors WHERE document_id = ?', doc.id).length, 0);
  assert.deepEqual(db.rows('SELECT channel_id FROM document_channel_access WHERE document_id = ?', doc.id).map(row => row.channel_id), [CHANNEL]);

  // Ahora sigue las reglas del canal: lo ve quien está en el canal, no el del otro servidor.
  assert.equal((await call(env, `/api/docs/${doc.id}`, { token: OTHER_TOKEN })).status, 200);
  assert.equal((await call(env, `/api/docs/${doc.id}`, { token: FAR_TOKEN })).status, 403);
  assert.equal((await call(env, `/api/docs/${doc.id}/move`, { method: 'POST' })).status, 409);
});

test('un documento personal no se publica como tarjeta del canal', async () => {
  const { env } = await setup();
  const doc = await createPersonal(env);
  const res = await call(env, `/api/docs/${doc.id}/message`, { method: 'POST', body: {} });
  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'personal_document');
});

test('solo quien es dueño archiva, restaura y elimina su documento personal', async () => {
  const { db, env } = await setup();
  const doc = await createPersonal(env);
  const archived = await call(env, `/api/docs/${doc.id}`, { method: 'DELETE' });
  assert.equal(archived.status, 200);
  assert.equal(archived.json.document.space, 'personal');

  const archivedList = await call(env, '/api/docs?archived=1');
  assert.ok(archivedList.json.documents.some(item => item.id === doc.id));

  const removed = await call(env, `/api/docs/${doc.id}/permanent`, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal(db.rows('SELECT * FROM personal_documents WHERE document_id = ?', doc.id).length, 0);
  assert.equal(db.rows('SELECT * FROM documents WHERE id = ?', doc.id).length, 0);
});

test('un enlace a un documento personal sin acceso se niega sin abrir nada', async () => {
  const { env } = await setup();
  const doc = await createPersonal(env);
  const headers = { 'x-bardo-custom-id': `bardo:open:${doc.id}` };
  const denied = await call(env, '/api/docs', { token: OTHER_TOKEN, headers });
  assert.equal(denied.json.launchDenied, 'doc');
  assert.equal(denied.json.contextDocumentId, null);

  await call(env, `/api/docs/${doc.id}/sharing`, { method: 'PATCH', body: { linkAccess: 'read' } });
  const opened = await call(env, '/api/docs', { token: OTHER_TOKEN, headers });
  assert.equal(opened.json.launchDenied, null);
  assert.equal(opened.json.contextDocumentId, doc.id);
  assert.equal(opened.json.documents.find(item => item.id === doc.id)?.role, 'viewer');

  // Con enlace de lectura, «editar» abre el lector en vez de negarlo.
  const editLink = await call(env, '/api/docs', { token: OTHER_TOKEN, headers: { 'x-bardo-custom-id': `bardo:open:edit:${doc.id}` } });
  assert.equal(editLink.json.contextDocumentId, doc.id);
  assert.equal(editLink.json.launchTarget, null);
});

test('ni la adopción de legados ni un clic en «Abrir» asignan un personal a un canal', async () => {
  const { db, env } = await setup();
  const doc = await createPersonal(env);
  db.run('DELETE FROM document_guild_access');
  await adoptLegacyDocumentsForGuild(db, GUILD, USER);
  assert.equal(db.rows('SELECT * FROM document_guild_access WHERE document_id = ?', doc.id).length, 0);

  await persistDocumentLaunchContext(db, { guild_id: GUILD, channel_id: CHANNEL }, doc.id, OTHER);
  assert.equal(db.rows('SELECT * FROM document_channel_access WHERE document_id = ?', doc.id).length, 0);
  assert.equal(db.rows('SELECT * FROM document_guild_access WHERE document_id = ?', doc.id).length, 0);
});
