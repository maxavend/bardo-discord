import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheNormalizedDocument,
  loadDocumentSource,
  saveDocumentSource,
} from '../src/db.js';

class ImportDb {
  constructor() {
    this.row = {
      source_blob: null,
      source_mime: null,
      source_type: null,
      import_status: 'ready',
      original_markdown: '',
      pages: '[]',
    };
  }

  prepare(query) {
    return {
      bind: (...params) => ({
        run: async () => {
          if (query.includes("SET source_blob = ?")) {
            const [sourceBlob, sourceMime, sourceType] = params;
            this.row.source_blob = sourceBlob;
            this.row.source_mime = sourceMime;
            this.row.source_type = sourceType;
            this.row.import_status = 'pending';
          } else if (query.includes("SET original_markdown = ?")) {
            const [markdown, pages] = params;
            this.row.original_markdown = markdown;
            this.row.pages = pages;
            this.row.import_status = 'ready';
            this.row.source_blob = null;
          }
          return { success: true };
        },
        first: async () => {
          if (query.includes('SELECT source_blob')) return this.row;
          return null;
        },
      }),
    };
  }
}

test('saveDocumentSource almacena bytes como ArrayBuffer y loadDocumentSource los recupera sin perder datos', async () => {
  const db = new ImportDb();
  const input = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);

  await saveDocumentSource(db, 'doc-pdf', {
    bytes: input,
    mime: 'application/pdf',
    type: 'pdf',
  });

  assert.ok(db.row.source_blob instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(db.row.source_blob)], [...input]);
  assert.equal(db.row.import_status, 'pending');

  const loaded = await loadDocumentSource(db, 'doc-pdf');
  assert.deepEqual([...loaded.bytes], [...input]);
  assert.equal(loaded.mime, 'application/pdf');
  assert.equal(loaded.type, 'pdf');
});

test('cacheNormalizedDocument marca ready y elimina el binario temporal', async () => {
  const db = new ImportDb();
  db.row.source_blob = new Uint8Array([1, 2, 3]).buffer;
  db.row.import_status = 'pending';

  await cacheNormalizedDocument(db, 'doc-pdf', '# Documento\n\nContenido', ['Contenido']);

  assert.equal(db.row.original_markdown, '# Documento\n\nContenido');
  assert.equal(db.row.pages, JSON.stringify(['Contenido']));
  assert.equal(db.row.import_status, 'ready');
  assert.equal(db.row.source_blob, null);
});
