import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveDocument,
  loadDocument,
  saveActivityContext,
  loadActivityContext,
} from '../src/db.js';

class MockD1PreparedStatement {
  constructor(db, query, params = []) {
    this.db = db;
    this.query = query;
    this.params = params;
  }

  bind(...params) {
    return new MockD1PreparedStatement(this.db, this.query, params);
  }

  async run() {
    if (this.query.includes('INSERT INTO documents')) {
      const [id, title, original_markdown, pages, source_name, created_at, created_by] = this.params;
      this.db.storage.set(id, {
        id,
        title,
        original_markdown,
        pages,
        source_name,
        created_at,
        created_by,
      });
      return { success: true };
    }
    if (this.query.includes('INSERT INTO activity_contexts')) {
      const [instance_id, document_id, created_at] = this.params;
      this.db.activityContexts.set(instance_id, {
        instance_id,
        document_id,
        created_at,
      });
      return { success: true };
    }
    return { success: true };
  }

  async first() {
    if (this.query.includes('FROM documents')) {
      const [id] = this.params;
      return this.db.storage.get(id) || null;
    }
    if (this.query.includes('FROM activity_contexts')) {
      const [instanceId] = this.params;
      return this.db.activityContexts.get(instanceId) || null;
    }
    return null;
  }
}

class MockD1Database {
  constructor() {
    this.storage = new Map();
    this.activityContexts = new Map();
  }

  prepare(query) {
    return new MockD1PreparedStatement(this, query);
  }
}

test('saveDocument y loadDocument persisten y recuperan el documento correctamente', async () => {
  const db = new MockD1Database();
  const document = {
    title: 'Minuta D1',
    originalMarkdown: '# Minuta D1\n\nTexto original.',
    pages: ['Texto original.'],
    sourceName: 'minuta.md',
    createdAt: new Date().toISOString(),
    createdBy: 'user123',
  };

  await saveDocument(db, 'msg-123456', document);
  const loaded = await loadDocument(db, 'msg-123456');

  assert.ok(loaded);
  assert.equal(loaded.id, 'msg-123456');
  assert.equal(loaded.title, 'Minuta D1');
  assert.equal(loaded.originalMarkdown, '# Minuta D1\n\nTexto original.');
  assert.deepEqual(loaded.pages, ['Texto original.']);
  assert.equal(loaded.sourceName, 'minuta.md');
  assert.equal(loaded.createdBy, 'user123');
});

test('loadDocument devuelve null si el documento no existe', async () => {
  const db = new MockD1Database();
  const loaded = await loadDocument(db, 'inexistente');
  assert.equal(loaded, null);
});

test('saveActivityContext y loadActivityContext persisten y recuperan el contexto correctamente', async () => {
  const db = new MockD1Database();
  await saveActivityContext(db, 'inst-123', 'doc-abc');

  const loaded = await loadActivityContext(db, 'inst-123');
  assert.ok(loaded);
  assert.equal(loaded.instanceId, 'inst-123');
  assert.equal(loaded.documentId, 'doc-abc');
  assert.ok(loaded.createdAt);
});

test('loadActivityContext devuelve null si el contexto no existe', async () => {
  const db = new MockD1Database();
  const loaded = await loadActivityContext(db, 'inst-inexistente');
  assert.equal(loaded, null);
});
