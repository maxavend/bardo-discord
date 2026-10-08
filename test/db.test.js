import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveDocument,
  loadDocument,
  saveActivityContext,
  loadActivityContext,
  listDocumentsForChannel,
  savePlannerSession,
  loadPlannerSession,
  updateDocumentContent,
} from '../src/db.js';
import { createTestDb, insertDocument } from './helpers/sqlite-d1.js';

test('saveDocument y loadDocument persisten y recuperan el documento correctamente', async () => {
  const db = createTestDb();
  const document = {
    title: 'Minuta D1',
    description: 'Resumen',
    originalMarkdown: '# Minuta D1\n\nTexto original.',
    pages: ['Texto original.'],
    sourceName: 'minuta.md',
    createdAt: new Date().toISOString(),
    createdBy: 'user123',
    createdByName: 'Maximiliano',
    updatedAt: new Date().toISOString(),
    updatedBy: 'user123',
    updatedByName: 'Maximiliano',
  };

  await saveDocument(db, 'msg-123456', document);
  const loaded = await loadDocument(db, 'msg-123456');

  assert.equal(loaded.id, 'msg-123456');
  assert.equal(loaded.title, 'Minuta D1');
  assert.equal(loaded.description, 'Resumen');
  assert.equal(loaded.originalMarkdown, '# Minuta D1\n\nTexto original.');
  assert.deepEqual(loaded.pages, ['Texto original.']);
  assert.equal(loaded.sourceName, 'minuta.md');
  assert.equal(loaded.createdBy, 'user123');
  assert.equal(loaded.createdByName, 'Maximiliano');
  assert.equal(loaded.updatedByName, 'Maximiliano');
});

test('loadDocument devuelve null si el documento no existe', async () => {
  assert.equal(await loadDocument(createTestDb(), 'inexistente'), null);
});

test('saveActivityContext y loadActivityContext persisten y recuperan el contexto', async () => {
  const db = createTestDb();
  await saveActivityContext(db, 'inst-123', 'doc-abc');
  const loaded = await loadActivityContext(db, 'inst-123');
  assert.equal(loaded.instanceId, 'inst-123');
  assert.equal(loaded.documentId, 'doc-abc');
  assert.ok(loaded.createdAt);
  assert.equal(await loadActivityContext(db, 'inst-inexistente'), null);
});

test('listDocumentsForChannel incluye autoría y canales sin seleccionar el blob', async () => {
  const db = createTestDb();
  insertDocument(db, { id: 'a', channelIds: ['c1', 'c2'], guildId: 'g1' });
  db.run("UPDATE documents SET created_by_name = 'Ana', updated_by = 'u2', updated_by_name = 'Beto' WHERE id = 'a'");
  const [doc] = await listDocumentsForChannel(db, 'g1', 'c1');
  assert.equal(doc.createdByName, 'Ana');
  assert.equal(doc.updatedBy, 'u2');
  assert.equal(doc.updatedByName, 'Beto');
  assert.deepEqual(doc.accessChannels.sort(), ['c1', 'c2']);
  assert.ok(!db.queries.at(-1).includes('source_blob,'), 'no debe seleccionar source_blob');
});

test('updateDocumentContent descarta el original solo si la fila superaría el límite de D1', async () => {
  const db = createTestDb();
  insertDocument(db, { id: 'pdf', sourceBlob: new Uint8Array(1_000_000), sourceType: 'pdf' });
  const base = { title: 'PDF', pages: ['x'], updatedAt: '2026-09-01T00:00:00.000Z' };

  assert.equal(await updateDocumentContent(db, 'pdf', { ...base, originalMarkdown: 'pequeño' }), true);
  assert.equal(db.row("SELECT LENGTH(source_blob) AS n FROM documents WHERE id = 'pdf'").n, 1_000_000);

  assert.equal(await updateDocumentContent(db, 'pdf', { ...base, originalMarkdown: 'x'.repeat(1_000_000) }), true);
  assert.equal(db.row("SELECT source_blob FROM documents WHERE id = 'pdf'").source_blob, null);
});

test('savePlannerSession nunca sobrescribe una reunión de otro canal con el mismo id', async () => {
  const db = createTestDb();
  const base = { id: 's1', title: 'Original', blocks: [{ id: 'b' }], createdBy: 'u1' };
  assert.equal(await savePlannerSession(db, { ...base, guildId: 'g1', channelId: 'c1' }), true);
  assert.equal(await savePlannerSession(db, { ...base, title: 'Pisada', blocks: [], guildId: 'g1', channelId: 'c2' }), false);
  assert.equal(await savePlannerSession(db, { ...base, title: 'Pisada', blocks: [], guildId: 'g2', channelId: 'c1' }), false);
  const stored = await loadPlannerSession(db, 's1', 'g1', 'c1');
  assert.equal(stored.title, 'Original');
  assert.equal(stored.blocks.length, 1);
});
