import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDocsApi } from '../src/docs-api.js';
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

async function setup({permissions} = {}) {
  const db = createTestDb();
  await insertSession(db);
  insertDocument(db, { id: 'doc-1', title: 'Doc Uno', createdBy: 'user-1' });
  const env = createEnv(db, permissions ? { DISCORD_FETCH: createDiscordFetch({ permissions }) } : {});
  return { db, env };
}

async function call(env, path, { method = 'GET', body, headers = {} } = {}) {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { ...authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handleDocsApi(request, new URL(request.url), env);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* binary or plain */ }
  return { status: response.status, json, text, headers: response.headers };
}

test('handleDocsApi rechaza requests sin sesión autenticada', async () => {
  const { env } = await setup();
  const req = new Request('http://localhost/api/docs');
  const res = await handleDocsApi(req, new URL(req.url), env);
  assert.equal(res.status, 401);
});

test('GET /api/docs lista documentos del canal con metadatos de autoría', async () => {
  const { db, env } = await setup();
  db.run("UPDATE documents SET created_by_name = 'Ana', updated_by_name = 'Beto' WHERE id = 'doc-1'");
  const { status, json } = await call(env, '/api/docs');
  assert.equal(status, 200);
  assert.equal(json.guildId, GUILD);
  assert.equal(json.user.id, USER);
  const doc = json.documents.find(d => d.id === 'doc-1');
  assert.ok(doc);
  assert.equal(doc.createdByName, 'Ana');
  assert.equal(doc.updatedByName, 'Beto');
  assert.equal(doc.archived, false);
  assert.equal(doc.importStatus, 'ready');
  assert.ok(doc.updatedAt);
});

test('GET /api/docs aplica el ACL de canal en SQL antes del LIMIT', async () => {
  const { db, env } = await setup();
  // 160 newer documents shared only in another channel must not crowd out ours.
  for (let index = 0; index < 160; index += 1) {
    insertDocument(db, {
      id: `other-${index}`,
      createdAt: `2026-09-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
      channelIds: ['channel-999'],
    });
  }
  const { json } = await call(env, '/api/docs');
  assert.deepEqual(json.documents.map(d => d.id), ['doc-1']);
  assert.ok(!db.queries.some(sql => /GROUP BY[\s\S]*source_blob/i.test(sql)), 'no debe agrupar por source_blob');
  assert.ok(!db.queries.some(sql => /COUNT\(\*\) AS count FROM document_guild_access/i.test(sql)));
});

test('GET /api/docs?summary=1 omite el cuerpo de los documentos', async () => {
  const { env } = await setup();
  const { json } = await call(env, '/api/docs?summary=1');
  assert.equal(json.documents[0].id, 'doc-1');
  assert.equal(json.documents[0].markdown, '');
});

test('GET /api/docs resuelve contextDocumentId desde header x-bardo-custom-id', async () => {
  const { env } = await setup();
  const { json } = await call(env, '/api/docs', { headers: { 'x-bardo-custom-id': 'bardo:open:doc-1' } });
  assert.equal(json.contextDocumentId, 'doc-1');
});

test('handleDocsApi reenvía un documento únicamente al canal de la sesión', async () => {
  const { env } = await setup();
  let postedPath = '';
  const baseFetch = env.DISCORD_FETCH;
  env.DISCORD_FETCH = async (input, init) => {
    const url = new URL(input);
    if (url.pathname === `/api/v10/channels/${CHANNEL}/messages`) {
      postedPath = url.pathname;
      return Response.json({ id: 'message-1' });
    }
    return baseFetch(input, init);
  };
  const { status, json } = await call(env, '/api/docs/doc-1/message', { method: 'POST' });
  assert.equal(status, 200);
  assert.deepEqual(json, { ok: true, messageId: 'message-1' });
  assert.equal(postedPath, `/api/v10/channels/${CHANNEL}/messages`);
});

test('POST /api/docs crea el documento y sus ACL en una sola operación', async () => {
  const { db, env } = await setup();
  const { status, json } = await call(env, '/api/docs', {
    method: 'POST',
    body: { title: 'Nuevo', description: 'Desc', markdown: '# Nuevo\n\nContenido nuevo' },
  });
  assert.equal(status, 201);
  const created = json.document;
  assert.equal(created.title, 'Nuevo');
  assert.equal(created.description, 'Desc');
  assert.equal(created.createdByName, 'TestUser');
  assert.ok(db.row('SELECT 1 AS ok FROM document_guild_access WHERE document_id = ? AND guild_id = ?', created.id, GUILD));
  assert.ok(db.row('SELECT 1 AS ok FROM document_channel_access WHERE document_id = ? AND channel_id = ?', created.id, CHANNEL));
});

test('POST /api/docs con id existente responde 409 exists sin crear copias', async () => {
  const { db, env } = await setup();
  const before = db.row('SELECT COUNT(*) AS n FROM documents').n;
  const { status, json } = await call(env, '/api/docs', {
    method: 'POST',
    body: { id: 'doc-1', title: 'Otro', markdown: '# Otro\n\nTexto' },
  });
  assert.equal(status, 409);
  assert.equal(json.error, 'exists');
  assert.equal(json.document.id, 'doc-1');
  assert.equal(json.document.title, 'Doc Uno');
  assert.equal(db.row('SELECT COUNT(*) AS n FROM documents').n, before);
});

test('POST /api/docs con id de otro servidor responde 409 sin revelar el documento', async () => {
  const { db, env } = await setup();
  insertDocument(db, { id: 'foreign', title: 'Secreto', guildId: 'guild-otro', channelIds: ['chan-otro'] });
  const { status, json } = await call(env, '/api/docs', {
    method: 'POST',
    body: { id: 'foreign', title: 'Pisar', markdown: '# Pisar\n\nX' },
  });
  assert.equal(status, 409);
  assert.equal(json.error, 'exists');
  assert.equal(json.document, undefined);
  assert.equal(db.row("SELECT title FROM documents WHERE id = 'foreign'").title, 'Secreto');
});

test('PATCH con baseUpdatedAt vigente guarda y devuelve el nuevo updatedAt', async () => {
  const { env } = await setup();
  const { status, json } = await call(env, '/api/docs/doc-1', {
    method: 'PATCH',
    body: { title: 'Doc Uno v2', markdown: '# Doc Uno v2\n\nNuevo cuerpo', baseUpdatedAt: '2026-08-20T10:00:00.000Z' },
  });
  assert.equal(status, 200);
  assert.equal(json.document.title, 'Doc Uno v2');
  assert.ok(json.document.updatedAt > '2026-08-20T10:00:00.000Z');
  assert.equal(json.document.updatedByName, 'TestUser');
});

test('PATCH con baseUpdatedAt obsoleto responde 409 conflict y no pisa el contenido', async () => {
  const { db, env } = await setup();
  const first = await call(env, '/api/docs/doc-1', {
    method: 'PATCH',
    body: { markdown: '# Doc Uno\n\nEdición de Ana', baseUpdatedAt: '2026-08-20T10:00:00.000Z' },
  });
  assert.equal(first.status, 200);

  const stale = await call(env, '/api/docs/doc-1', {
    method: 'PATCH',
    body: { markdown: '# Doc Uno\n\nEdición vieja de Beto', baseUpdatedAt: '2026-08-20T10:00:00.000Z' },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'conflict');
  assert.equal(stale.json.document.markdown, '# Doc Uno\n\nEdición de Ana');
  assert.equal(db.row("SELECT original_markdown FROM documents WHERE id = 'doc-1'").original_markdown, '# Doc Uno\n\nEdición de Ana');
});

test('dos PATCH consecutivos generan updatedAt distintos', async () => {
  const { env } = await setup();
  const a = await call(env, '/api/docs/doc-1', { method: 'PATCH', body: { markdown: '# A\n\n1' } });
  const b = await call(env, '/api/docs/doc-1', { method: 'PATCH', body: { markdown: '# A\n\n2', baseUpdatedAt: a.json.document.updatedAt } });
  assert.equal(b.status, 200);
  assert.notEqual(a.json.document.updatedAt, b.json.document.updatedAt);
});

test('PATCH no desarchiva un documento archivado', async () => {
  const { db, env } = await setup();
  db.run("UPDATE documents SET archived_at = '2026-08-21T00:00:00.000Z' WHERE id = 'doc-1'");
  const { status } = await call(env, '/api/docs/doc-1', { method: 'PATCH', body: { markdown: '# Doc\n\nCambio' } });
  assert.equal(status, 200);
  assert.equal(db.row("SELECT archived_at FROM documents WHERE id = 'doc-1'").archived_at, '2026-08-21T00:00:00.000Z');
});

test('PATCH sobre un documento con importación pendiente responde 409 import_pending', async () => {
  const { db, env } = await setup();
  insertDocument(db, { id: 'pdf-1', importStatus: 'pending', sourceBlob: new Uint8Array([37, 80, 68, 70]), sourceType: 'pdf' });
  const { status, json } = await call(env, '/api/docs/pdf-1', { method: 'PATCH', body: { markdown: '# Placeholder\n\nEditado' } });
  assert.equal(status, 409);
  assert.equal(json.error, 'import_pending');
  assert.equal(db.row("SELECT import_status FROM documents WHERE id = 'pdf-1'").import_status, 'pending');
});

test('normalize solo aplica mientras la importación está pendiente', async () => {
  const { db, env } = await setup();
  insertDocument(db, { id: 'pdf-1', importStatus: 'pending', sourceBlob: new Uint8Array([37, 80, 68, 70]), sourceType: 'pdf' });

  const first = await call(env, '/api/docs/pdf-1/normalize', { method: 'POST', body: { markdown: '# PDF\n\nTexto real del PDF' } });
  assert.equal(first.status, 200);
  assert.equal(first.json.document.importStatus, 'ready');
  // The original file is kept while the row fits D1's size limit.
  assert.equal(first.json.document.hasSource, true);

  // The user edits after the import…
  const edit = await call(env, '/api/docs/pdf-1', {
    method: 'PATCH',
    body: { markdown: '# PDF\n\nTexto real editado', baseUpdatedAt: first.json.document.updatedAt },
  });
  assert.equal(edit.status, 200);

  // …and a late normalization from another client must not overwrite it.
  const late = await call(env, '/api/docs/pdf-1/normalize', { method: 'POST', body: { markdown: '# PDF\n\nTexto real del PDF' } });
  assert.equal(late.status, 409);
  assert.equal(late.json.error, 'already_normalized');
  assert.equal(db.row("SELECT original_markdown FROM documents WHERE id = 'pdf-1'").original_markdown, '# PDF\n\nTexto real editado');
});

test('PATCH con contexto obsoleto tras normalizar responde conflict (no pisa el PDF importado)', async () => {
  const { env, db } = await setup();
  insertDocument(db, { id: 'pdf-1', importStatus: 'pending', sourceBlob: new Uint8Array([1]), sourceType: 'pdf' });
  const listed = await call(env, '/api/docs');
  const placeholder = listed.json.documents.find(d => d.id === 'pdf-1');
  await call(env, '/api/docs/pdf-1/normalize', { method: 'POST', body: { markdown: '# PDF\n\nContenido real' } });
  const stale = await call(env, '/api/docs/pdf-1', {
    method: 'PATCH',
    body: { markdown: '# PDF\n\nPlaceholder editado', baseUpdatedAt: placeholder.updatedAt },
  });
  assert.equal(stale.status, 409);
  assert.equal(db.row("SELECT original_markdown FROM documents WHERE id = 'pdf-1'").original_markdown, '# PDF\n\nContenido real');
});

test('DELETE permanente exige que el documento esté archivado', async () => {
  const { db, env } = await setup();
  db.run("UPDATE documents SET created_by = ? WHERE id = 'doc-1'", USER);
  const { status, json } = await call(env, '/api/docs/doc-1/permanent', { method: 'DELETE' });
  assert.equal(status, 409);
  assert.equal(json.error, 'not_archived');
  assert.ok(db.row("SELECT 1 AS ok FROM documents WHERE id = 'doc-1'"));
});

test('DELETE permanente lo rechaza a quien no es autor ni modera el canal', async () => {
  const { db, env } = await setup();
  db.run("UPDATE documents SET archived_at = '2026-08-21T00:00:00.000Z' WHERE id = 'doc-1'");
  const { status, json } = await call(env, '/api/docs/doc-1/permanent', { method: 'DELETE' });
  assert.equal(status, 403);
  assert.equal(json.error, 'forbidden');
  assert.ok(db.row("SELECT 1 AS ok FROM documents WHERE id = 'doc-1'"));
});

test('DELETE permanente del autor borra documento, ACL, intents y contextos en un batch', async () => {
  const { db, env } = await setup();
  db.run("UPDATE documents SET archived_at = '2026-08-21T00:00:00.000Z', created_by = ? WHERE id = 'doc-1'", USER);
  db.run("INSERT INTO docs_launch_intents (user_id, guild_id, document_id, created_at) VALUES ('u9', ?, 'doc-1', 'x')", GUILD);
  db.run("INSERT INTO activity_contexts (instance_id, document_id, created_at) VALUES ('i-1', 'doc-1', 'x')");

  const { status, json } = await call(env, '/api/docs/doc-1/permanent', { method: 'DELETE' });
  assert.equal(status, 200);
  assert.equal(json.deleted, true);
  for (const [table, column] of [
    ['documents', 'id'], ['document_guild_access', 'document_id'], ['document_channel_access', 'document_id'],
    ['docs_launch_intents', 'document_id'], ['activity_contexts', 'document_id'],
  ]) {
    assert.equal(db.row(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = 'doc-1'`).n, 0, table);
  }
});

test('DELETE permanente lo permite a quien tiene Manage Messages', async () => {
  const MANAGE_MESSAGES_AND_VIEW = String((1n << 13n) | (1n << 10n));
  const { db, env } = await setup({ permissions: MANAGE_MESSAGES_AND_VIEW });
  db.run("UPDATE documents SET archived_at = '2026-08-21T00:00:00.000Z' WHERE id = 'doc-1'");
  const { status } = await call(env, '/api/docs/doc-1/permanent', { method: 'DELETE' });
  assert.equal(status, 200);
});

test('un 429 de Discord responde 503 discord_unavailable en vez de 403', async () => {
  const { env } = await setup();
  env.DISCORD_FETCH = createDiscordFetch({ fail: 429 });
  const { status, json, headers } = await call(env, '/api/docs/doc-1', { method: 'PATCH', body: { markdown: '# X\n\nY' } });
  assert.equal(status, 503);
  assert.equal(json.error, 'discord_unavailable');
  assert.equal(json.retryAfterMs, 1500);
  assert.ok(headers.get('retry-after'));
});

test('handleDocsApi rechaza acceso a documento no compartido con el canal', async () => {
  const { env } = await setup();
  const { status, json } = await call(env, '/api/docs/doc-privado-ajeno');
  assert.equal(status, 403);
  assert.equal(json.error, 'forbidden');
});

test('archivar (DELETE) y restaurar conservan el documento', async () => {
  const { db, env } = await setup();
  assert.equal((await call(env, '/api/docs/doc-1', { method: 'DELETE' })).status, 200);
  assert.ok(db.row("SELECT archived_at FROM documents WHERE id = 'doc-1'").archived_at);
  const archived = await call(env, '/api/docs?archived=1');
  assert.deepEqual(archived.json.documents.map(d => d.id), ['doc-1']);
  assert.equal(archived.json.documents[0].archived, true);
  assert.equal((await call(env, '/api/docs/doc-1/restore', { method: 'POST' })).status, 200);
  assert.equal(db.row("SELECT archived_at FROM documents WHERE id = 'doc-1'").archived_at, null);
});

test('un documento con updated_at vacío ("") se puede editar con el updatedAt que devuelve GET (sin 409 falso)', async () => {
  const { db, env } = await setup();
  db.run("UPDATE documents SET updated_at = '' WHERE id = 'doc-1'");
  const current = await call(env, '/api/docs/doc-1');
  const base = current.json.updatedAt;
  assert.ok(base);
  const patch = await call(env, '/api/docs/doc-1', {
    method: 'PATCH',
    body: { title: 'Editado', markdown: '# Editado\n\nhola', baseUpdatedAt: base },
  });
  assert.equal(patch.status, 200);
  const again = await call(env, '/api/docs/doc-1', {
    method: 'PATCH',
    body: { title: 'Editado 2', markdown: '# Editado 2\n\nhola', baseUpdatedAt: patch.json.document.updatedAt },
  });
  assert.equal(again.status, 200);
});

test('archivar y restaurar devuelven el documento con su updatedAt nuevo, válido como baseUpdatedAt', async () => {
  const { env } = await setup();
  const archived = await call(env, '/api/docs/doc-1', { method: 'DELETE' });
  assert.equal(archived.json.document.id, 'doc-1');
  const restored = await call(env, '/api/docs/doc-1/restore', { method: 'POST' });
  assert.ok(restored.json.document.updatedAt);
  const patch = await call(env, '/api/docs/doc-1', {
    method: 'PATCH',
    body: { title: 'Tras restaurar', markdown: '# Tras restaurar\n\nhola', baseUpdatedAt: restored.json.document.updatedAt },
  });
  assert.equal(patch.status, 200);
});
