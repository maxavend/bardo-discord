import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from 'wrangler';
import p5Entry from '../src/p5-entry.js';
import { defaultPermissionsForTarget } from '../src/auth/activity-access.js';
import { loadDocument, saveActivityContext, saveDocument } from '../src/db.js';

const DOC = 'phase5-doc';
const INSTANCE_A = 'phase5-a';
const INSTANCE_B = 'phase5-b';

async function withRuntime(run) {
  const server = createTestHarness({ workers: [{ configPath: './wrangler.jsonc' }] });
  await server.listen();
  try {
    const runtime = server.getWorker('bardo-discord');
    await runtime.applyD1Migrations('DB');
    const env = await runtime.getEnv();
    env.BARDO_TEST_AUTH_BYPASS = '1';
    await run(env);
  } catch (error) { server.debug(); throw error; }
  finally { await server.close(); }
}

function req(instanceId, path, { method = 'GET', body, version } = {}) {
  return new Request(`https://bardo.test${path}`, {
    method,
    headers: {
      'x-bardo-instance-id': instanceId,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(version ? { 'If-Match': `"bardo-doc-${version}"` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function fixture(env) {
  await saveDocument(env.DB, DOC, {
    title: 'Original', originalMarkdown: '# Original\n\nContenido inicial.', pages: ['Contenido inicial.'],
    sourceName: 'original.md', createdAt: new Date().toISOString(), createdBy: 'editor-a',
  });
  const permissions = defaultPermissionsForTarget(DOC);
  await saveActivityContext(env.DB, INSTANCE_A, DOC, { permissions });
  await saveActivityContext(env.DB, INSTANCE_B, DOC, { permissions });
}

test('Phase 5 migration adds document version metadata and bounded revision history', async () => withRuntime(async (env) => {
  const version = await env.DB.prepare("SELECT name FROM pragma_table_info('documents') WHERE name='version'").first();
  const revisions = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_revisions'").first();
  assert.equal(version?.name, 'version');
  assert.equal(revisions?.name, 'document_revisions');
}));

test('two editor sessions cannot silently overwrite the same base version', async () => withRuntime(async (env) => {
  await fixture(env);
  const firstRead = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}`), env, {});
  const secondRead = await p5Entry.fetch(req(INSTANCE_B, `/api/documents/${DOC}`), env, {});
  assert.equal((await firstRead.clone().json()).version, 1);
  assert.equal((await secondRead.clone().json()).version, 1);
  assert.equal(firstRead.headers.get('etag'), '"bardo-doc-1"');

  const firstSave = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}`, {
    method: 'PATCH', version: 1, body: { title: 'Sesión A', markdown: '# Sesión A\n\nCambio A.' },
  }), env, { waitUntil() {} });
  assert.equal(firstSave.status, 200);
  assert.equal((await firstSave.json()).document.version, 2);

  const staleSave = await p5Entry.fetch(req(INSTANCE_B, `/api/documents/${DOC}`, {
    method: 'PATCH', version: 1, body: { title: 'Sesión B', markdown: '# Sesión B\n\nCambio B.' },
  }), env, { waitUntil() {} });
  assert.equal(staleSave.status, 409);
  const conflict = await staleSave.json();
  assert.equal(conflict.code, 'DOCUMENT_VERSION_CONFLICT');
  assert.equal(conflict.currentVersion, 2);
  assert.equal('markdown' in conflict, false);

  const stored = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}`), env, {});
  const storedDoc = await stored.json();
  assert.equal(storedDoc.title, 'Sesión A');
  assert.equal(storedDoc.version, 2);

  const history = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}/history`), env, {});
  const historyData = await history.json();
  assert.equal(historyData.current.version, 2);
  assert.ok(historyData.revisions.some((item) => item.version === 1));
}));

test('PATCH requires an expected version and restore always creates a new version without deleting history', async () => withRuntime(async (env) => {
  await fixture(env);
  const missing = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}`, {
    method: 'PATCH', body: { title: 'Sin versión', markdown: '# Sin versión' },
  }), env, { waitUntil() {} });
  assert.equal(missing.status, 428);

  let saved = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}`, {
    method: 'PATCH', version: 1, body: { title: 'Versión 2', markdown: '# Versión 2\n\nDos.' },
  }), env, { waitUntil() {} });
  assert.equal((await saved.json()).document.version, 2);
  saved = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}`, {
    method: 'PATCH', version: 2, body: { title: 'Versión 3', markdown: '# Versión 3\n\nTres.' },
  }), env, { waitUntil() {} });
  assert.equal((await saved.json()).document.version, 3);

  const historyResponse = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}/history`), env, {});
  const history = await historyResponse.json();
  const original = history.revisions.find((item) => item.version === 1);
  assert.ok(original?.id);

  let restored = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}/history/${original.id}/restore`, {
    method: 'POST', version: 3, body: { expectedVersion: 3 },
  }), env, { waitUntil() {} });
  assert.equal(restored.status, 200);
  let restoredDoc = (await restored.json()).document;
  assert.equal(restoredDoc.version, 4);
  assert.equal(restoredDoc.title, 'Original');

  const after = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}/history`), env, {});
  const afterHistory = await after.json();
  assert.equal(afterHistory.current.version, 4);
  assert.ok(afterHistory.revisions.some((item) => item.version === 3));
  assert.ok(afterHistory.revisions.some((item) => item.version === 2));
  assert.ok(afterHistory.revisions.some((item) => item.version === 1));

  restored = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}/history/${original.id}/restore`, {
    method: 'POST', version: 4, body: { expectedVersion: 4 },
  }), env, { waitUntil() {} });
  assert.equal(restored.status, 200);
  restoredDoc = (await restored.json()).document;
  assert.equal(restoredDoc.version, 5);
  assert.equal(restoredDoc.title, 'Original');
  const finalHistory = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}/history`), env, {});
  const finalHistoryData = await finalHistory.json();
  assert.equal(finalHistoryData.current.version, 5);
  assert.ok(finalHistoryData.revisions.some((item) => item.version === 4));
}));

test('versioned edits preserve every generated page for long documents', async () => withRuntime(async (env) => {
  await fixture(env);
  const paragraphs = Array.from({ length: 18 }, (_, index) => `## Sección ${index + 1}\n\n${`contenido-${index + 1} `.repeat(280)}`).join('\n\n');
  const markdown = `# Documento largo\n\n${paragraphs}`;
  const response = await p5Entry.fetch(req(INSTANCE_A, `/api/documents/${DOC}`, {
    method: 'PATCH', version: 1, body: { title: 'Documento largo', markdown },
  }), env, { waitUntil() {} });
  assert.equal(response.status, 200);
  const stored = await env.DB.prepare('SELECT pages FROM documents WHERE id = ?').bind(DOC).first();
  const pages = JSON.parse(stored.pages);
  assert.ok(pages.length > 1, 'el editor debe conservar la paginación completa, no solo la primera página');
  assert.match(pages.at(-1), /Sección 18/);
}));

test('legacy/system document rewrites also advance version through the migration trigger', async () => withRuntime(async (env) => {
  await fixture(env);
  await saveDocument(env.DB, DOC, {
    title: 'Sistema', originalMarkdown: '# Sistema\n\nActualizado fuera del editor.', pages: ['Actualizado fuera del editor.'],
    sourceName: 'original.md', createdAt: new Date().toISOString(), createdBy: 'system',
  });
  const row = await env.DB.prepare('SELECT version, title FROM documents WHERE id = ?').bind(DOC).first();
  assert.equal(Number(row.version), 2);
  assert.equal(row.title, 'Sistema');
  const snapshot = await env.DB.prepare('SELECT version, title FROM document_revisions WHERE document_id = ? AND version = 1').bind(DOC).first();
  assert.equal(snapshot.title, 'Original');
}));

test('history remains protected by Activity authorization', async () => withRuntime(async (env) => {
  await fixture(env);
  const anonymous = await p5Entry.fetch(new Request(`https://bardo.test/api/documents/${DOC}/history`), env, {});
  assert.equal(anonymous.status, 401);
  const document = await loadDocument(env.DB, DOC);
  assert.equal(document.title, 'Original');
}));
