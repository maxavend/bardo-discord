import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheNormalizedDocument,
  loadDocument,
  loadDocumentSource,
  saveDocumentSource,
} from '../src/db.js';
import { createTestDb, insertDocument } from './helpers/sqlite-d1.js';

test('saveDocumentSource almacena bytes y loadDocumentSource los recupera sin perder datos', async () => {
  const db = createTestDb();
  insertDocument(db, { id: 'doc-pdf' });
  const input = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);

  await saveDocumentSource(db, 'doc-pdf', { bytes: input, mime: 'application/pdf', type: 'pdf' });
  assert.equal(db.row("SELECT import_status FROM documents WHERE id = 'doc-pdf'").import_status, 'pending');

  const loaded = await loadDocumentSource(db, 'doc-pdf');
  assert.deepEqual([...loaded.bytes], [...input]);
  assert.equal(loaded.mime, 'application/pdf');
  assert.equal(loaded.type, 'pdf');
});

test('cacheNormalizedDocument marca ready y conserva el original si cabe en la fila', async () => {
  const db = createTestDb();
  insertDocument(db, { id: 'doc-pdf', importStatus: 'pending', sourceBlob: new Uint8Array([1, 2, 3]), sourceType: 'pdf' });

  assert.equal(await cacheNormalizedDocument(db, 'doc-pdf', '# Documento\n\nContenido', ['Contenido']), true);
  const doc = await loadDocument(db, 'doc-pdf');
  assert.equal(doc.originalMarkdown, '# Documento\n\nContenido');
  assert.deepEqual(doc.pages, ['Contenido']);
  assert.equal(doc.importStatus, 'ready');
  assert.equal(doc.hasSource, true);
});

test('cacheNormalizedDocument descarta el original cuando la fila superaría el límite de D1', async () => {
  const db = createTestDb();
  insertDocument(db, { id: 'doc-pdf', importStatus: 'pending', sourceBlob: new Uint8Array(1_500_000), sourceType: 'pdf' });
  await cacheNormalizedDocument(db, 'doc-pdf', 'x'.repeat(600_000), ['x']);
  const doc = await loadDocument(db, 'doc-pdf');
  assert.equal(doc.importStatus, 'ready');
  assert.equal(doc.hasSource, false);
});

test('cacheNormalizedDocument no pisa un documento que ya no está pendiente', async () => {
  const db = createTestDb();
  insertDocument(db, { id: 'doc-pdf', markdown: '# Editado por una persona' });
  assert.equal(await cacheNormalizedDocument(db, 'doc-pdf', '# Reimportado', ['x']), false);
  assert.equal((await loadDocument(db, 'doc-pdf')).originalMarkdown, '# Editado por una persona');
});
