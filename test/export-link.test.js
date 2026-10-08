// Enlaces firmados de descarga: la Activity pide un enlace con su sesión y lo
// abre en el navegador del sistema (las descargas dentro de Discord fallan).
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { handleDocsApi } from '../src/docs-api.js';
import { createExportToken, normalizeExportFormat, verifyExportToken } from '../src/export-token.js';
import { CHANNEL, authHeaders, createEnv, createTestDb, insertDocument, insertSession } from './helpers/sqlite-d1.js';

const SECRET = 'test-client-secret';

async function setup(extra = {}) {
  const db = createTestDb();
  await insertSession(db);
  insertDocument(db, { id: 'doc-1', title: 'Acta de la reunión', markdown: '# Acta de la reunión\n\nHola **mundo**' });
  return { db, env: createEnv(db, { DISCORD_CLIENT_SECRET: SECRET, ...extra }) };
}

async function exportLink(env, id, body, headers = authHeaders()) {
  const request = new Request(`https://bardo.example/api/docs/${id}/export-link`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await handleDocsApi(request, new URL(request.url), env);
  return { status: response.status, json: await response.json() };
}

test('normalizeExportFormat acepta md/docx/pdf y sus alias', () => {
  assert.equal(normalizeExportFormat('MD'), 'md');
  assert.equal(normalizeExportFormat('markdown'), 'md');
  assert.equal(normalizeExportFormat('word'), 'docx');
  assert.equal(normalizeExportFormat('pdf'), 'pdf');
  assert.equal(normalizeExportFormat('exe'), null);
});

test('POST /api/docs/:id/export-link devuelve una URL firmada que vence en 5 minutos', async () => {
  const { env } = await setup();
  const before = Date.now();
  const { status, json } = await exportLink(env, 'doc-1', { format: 'pdf' });
  assert.equal(status, 200);
  const url = new URL(json.url);
  assert.equal(url.origin, 'https://bardo.example');
  assert.equal(url.pathname, '/api/documents/doc-1/export');
  assert.equal(url.searchParams.get('format'), 'pdf');
  assert.ok(url.searchParams.get('t'));
  const expires = Date.parse(json.expiresAt);
  assert.ok(expires - before > 4.5 * 60_000 && expires - before <= 5 * 60_000 + 1000);
});

test('export-link respeta PUBLIC_ORIGIN, valida el formato y exige acceso al documento', async () => {
  const { db, env } = await setup({ PUBLIC_ORIGIN: 'https://bardo-discord.workers.dev/' });
  const ok = await exportLink(env, 'doc-1', { format: 'docx' });
  assert.ok(ok.json.url.startsWith('https://bardo-discord.workers.dev/api/documents/doc-1/export?format=docx&t='));

  const bad = await exportLink(env, 'doc-1', { format: 'exe' });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'invalid_format');
  assert.match(bad.json.message, /Markdown, Word o PDF/);

  insertDocument(db, { id: 'doc-otro', channelIds: ['channel-999'] });
  assert.equal((await exportLink(env, 'doc-otro', { format: 'pdf' })).status, 403);
  assert.equal((await exportLink(env, 'doc-1', { format: 'pdf' }, {})).status, 401);
});

test('export-link sin secreto configurado responde 503 en español', async () => {
  const { env } = await setup({ DISCORD_CLIENT_SECRET: '' });
  const { status, json } = await exportLink(env, 'doc-1', { format: 'pdf' });
  assert.equal(status, 503);
  assert.equal(json.error, 'export_unavailable');
});

test('el enlace descarga sin sesión, como adjunto con nombre UTF-8', async () => {
  const { env } = await setup();
  for (const [format, type, extension] of [
    ['pdf', 'application/pdf', 'pdf'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['md', 'text/markdown; charset=utf-8', 'md'],
  ]) {
    const { json } = await exportLink(env, 'doc-1', { format });
    // Opened in the system browser: no Authorization header.
    const res = await worker.fetch(new Request(json.url), env);
    assert.equal(res.status, 200, format);
    assert.equal(res.headers.get('content-type'), type);
    const disposition = res.headers.get('content-disposition');
    assert.match(disposition, /^attachment; /);
    assert.match(disposition, new RegExp(`filename="Acta de la reunion\\.${extension}"`));
    assert.match(disposition, new RegExp(`filename\\*=UTF-8''Acta%20de%20la%20reuni%C3%B3n\\.${extension}`));
  }
});

test('un enlace solo sirve para su documento y formato, y vence', async () => {
  const { db, env } = await setup();
  insertDocument(db, { id: 'doc-2' });
  const { json } = await exportLink(env, 'doc-1', { format: 'pdf' });
  const token = new URL(json.url).searchParams.get('t');

  const otherFormat = await worker.fetch(new Request(`https://bardo.example/api/documents/doc-1/export?format=docx&t=${token}`), env);
  assert.equal(otherFormat.status, 403);
  assert.match(otherFormat.headers.get('content-type'), /text\/html/);
  assert.match(await otherFormat.text(), /no es válido/);

  const otherDoc = await worker.fetch(new Request(`https://bardo.example/api/documents/doc-2/export?format=pdf&t=${token}`), env);
  assert.equal(otherDoc.status, 403);

  const tampered = await worker.fetch(new Request(`https://bardo.example/api/documents/doc-1/export?format=pdf&t=${token}x`), env);
  assert.equal(tampered.status, 403);

  const expired = await createExportToken(env, { docId: 'doc-1', format: 'pdf', userId: 'u', now: Date.now() - 6 * 60_000 });
  const late = await worker.fetch(new Request(`https://bardo.example/api/documents/doc-1/export?format=pdf&t=${encodeURIComponent(expired.token)}`), env);
  assert.equal(late.status, 410);
  assert.match(await late.text(), /expiró/);
});

test('un token firmado con otro secreto no sirve', async () => {
  const { token } = await createExportToken({ DISCORD_CLIENT_SECRET: 'otro' }, { docId: 'doc-1', format: 'pdf', userId: 'u' });
  const result = await verifyExportToken({ DISCORD_CLIENT_SECRET: SECRET }, token, { docId: 'doc-1', format: 'pdf' });
  assert.deepEqual(result, { ok: false, reason: 'invalid' });
});

test('si el documento se eliminó, el enlace muestra una página clara', async () => {
  const { db, env } = await setup();
  const { json } = await exportLink(env, 'doc-1', { format: 'pdf' });
  db.run("DELETE FROM document_channel_access WHERE document_id = 'doc-1'");
  db.run("DELETE FROM document_guild_access WHERE document_id = 'doc-1'");
  db.run("DELETE FROM documents WHERE id = 'doc-1'");
  const res = await worker.fetch(new Request(json.url), env);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /ya no existe/);
});

test('la descarga con sesión sigue funcionando y rechaza formatos desconocidos', async () => {
  const { env } = await setup();
  const ok = await worker.fetch(new Request('https://bardo.example/api/documents/doc-1/export?format=pdf', { headers: authHeaders() }), env);
  assert.equal(ok.status, 200);
  const bad = await worker.fetch(new Request('https://bardo.example/api/documents/doc-1/export?format=exe', { headers: authHeaders() }), env);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'invalid_format');
});

test('compartir en el canal publica una tarjeta que dice quién compartió', async () => {
  const { env } = await setup();
  let posted = null;
  const baseFetch = env.DISCORD_FETCH;
  env.DISCORD_FETCH = async (input, init) => {
    if (new URL(input).pathname === `/api/v10/channels/${CHANNEL}/messages`) {
      posted = JSON.parse(init.body);
      return Response.json({ id: 'm-1' });
    }
    return baseFetch(input, init);
  };
  const request = new Request('https://bardo.example/api/docs/doc-1/message', { method: 'POST', headers: authHeaders() });
  const response = await handleDocsApi(request, new URL(request.url), env);
  assert.equal(response.status, 200);
  const text = JSON.stringify(posted);
  assert.match(text, /Compartido por TestUser/);
  assert.match(text, /"label":"Abrir documento"/);
});

test('los errores de la API de documentos están en español', async () => {
  const { env } = await setup();
  const request = new Request('https://bardo.example/api/docs/doc-1/restore', { method: 'GET', headers: authHeaders() });
  const response = await handleDocsApi(request, new URL(request.url), env);
  assert.equal(response.status, 405);
  const json = await response.json();
  assert.equal(json.error, 'method_not_allowed');
  assert.match(json.message, /no está disponible/);
});

test('el enlace firmado también descarga el archivo original (PDF/DOCX subido)', async () => {
  const db = createTestDb();
  await insertSession(db);
  insertDocument(db, {
    id: 'pdf-1',
    title: 'Informe',
    sourceType: 'pdf',
    sourceBlob: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    importStatus: 'pending',
  });
  const env = createEnv(db, { DISCORD_CLIENT_SECRET: SECRET });
  const link = await exportLink(env, 'pdf-1', { format: 'original' });
  assert.equal(link.status, 200);
  const response = await worker.fetch(new Request(link.json.url), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Disposition'), /attachment/);
  // Nombre original si está guardado; si no, el título con la extensión del archivo.
  assert.match(response.headers.get('Content-Disposition'), /filename\*=UTF-8''(informe-final|Informe)\.pdf/);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0x25, 0x50, 0x44, 0x46]);

  // Sin original guardado: página clara, no JSON ni error crudo.
  const { env: env2 } = await setup();
  const link2 = await exportLink(env2, 'doc-1', { format: 'original' });
  const missing = await worker.fetch(new Request(link2.json.url), env2);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /original ya no está disponible/);
});
