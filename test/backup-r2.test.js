import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveOriginalToR2,
  saveNormalizedBackupToR2,
  getOriginalFromR2,
  getNormalizedBackupFromR2,
  restoreDocumentToD1,
  createDatabaseSnapshot,
  listDatabaseSnapshots,
  restoreDatabaseFromSnapshot,
  getExtensionFromSource,
} from '../src/backup-r2.js';

class MockR2Object {
  constructor(key, value, options = {}) {
    this.key = key;
    this.value = value;
    this.httpMetadata = options.httpMetadata || {};
    this.customMetadata = options.customMetadata || {};
    this.uploaded = new Date().toISOString();
    this.size = typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength || value.length || 0;
  }

  async text() {
    if (typeof this.value === 'string') return this.value;
    return new TextDecoder().decode(this.value);
  }

  async arrayBuffer() {
    if (typeof this.value === 'string') {
      return new TextEncoder().encode(this.value).buffer;
    }
    if (this.value instanceof ArrayBuffer) return this.value;
    if (ArrayBuffer.isView(this.value)) {
      return this.value.buffer.slice(this.value.byteOffset, this.value.byteOffset + this.value.byteLength);
    }
    return new Uint8Array(this.value).buffer;
  }

  async json() {
    return JSON.parse(await this.text());
  }
}

class MockR2Bucket {
  constructor() {
    this.storage = new Map();
  }

  async put(key, value, options = {}) {
    const obj = new MockR2Object(key, value, options);
    this.storage.set(key, obj);
    return obj;
  }

  async get(key) {
    return this.storage.get(key) || null;
  }

  async head(key) {
    const obj = this.storage.get(key);
    if (!obj) return null;
    return {
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      httpMetadata: obj.httpMetadata,
      customMetadata: obj.customMetadata,
    };
  }

  async list(options = {}) {
    const prefix = options.prefix || '';
    const limit = options.limit || 1000;
    const objects = [];
    for (const [key, obj] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        objects.push({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          httpMetadata: obj.httpMetadata,
          customMetadata: obj.customMetadata,
        });
      }
    }
    return { objects: objects.slice(0, limit), truncated: false };
  }

  async delete(key) {
    this.storage.delete(key);
  }
}

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
      const [id, title, original_markdown, pages, source_name, created_at, created_by, source_mime, source_type, import_status] = this.params;
      this.db.documents.set(id, {
        id,
        title,
        original_markdown,
        pages,
        source_name,
        created_at,
        created_by,
        source_mime: source_mime || null,
        source_type: source_type || 'markdown',
        import_status: import_status || 'ready',
      });
      return { success: true };
    }
    if (this.query.includes('UPDATE documents') && this.query.includes('source_mime = ?')) {
      const [source_mime, source_type, import_status, id] = this.params;
      const doc = this.db.documents.get(id);
      if (doc) {
        doc.source_mime = source_mime;
        doc.source_type = source_type;
        doc.import_status = import_status;
      }
      return { success: true };
    }
    if (this.query.includes('INSERT INTO boards')) {
      const [id, guild_id, name, description, columns, members, created_by, created_at, updated_at] = this.params;
      this.db.boards.set(id, {
        id,
        guild_id,
        name,
        description,
        columns,
        members,
        created_by,
        created_at,
        updated_at,
      });
      return { success: true };
    }
    if (this.query.includes('INSERT INTO tasks')) {
      const [id, board_id, title, description, status, priority, assignee_id, assignee_name, labels, position, created_by, created_at, updated_at] = this.params;
      this.db.tasks.set(id, {
        id,
        board_id,
        title,
        description,
        status,
        priority,
        assignee_id,
        assignee_name,
        labels,
        position,
        created_by,
        created_at,
        updated_at,
      });
      return { success: true };
    }
    return { success: true };
  }

  async all() {
    if (this.query.includes('FROM documents')) {
      return { results: Array.from(this.db.documents.values()) };
    }
    if (this.query.includes('FROM boards')) {
      return { results: Array.from(this.db.boards.values()) };
    }
    if (this.query.includes('FROM tasks')) {
      return { results: Array.from(this.db.tasks.values()) };
    }
    return { results: [] };
  }

  async first() {
    if (this.query.includes('FROM documents')) {
      const [id] = this.params;
      return this.db.documents.get(id) || null;
    }
    return null;
  }
}

class MockD1Database {
  constructor() {
    this.documents = new Map();
    this.boards = new Map();
    this.tasks = new Map();
  }

  prepare(query) {
    return new MockD1PreparedStatement(this, query);
  }
}

test('getExtensionFromSource reconoce extensiones válidas', () => {
  assert.equal(getExtensionFromSource('pdf', 'archivo.pdf'), 'pdf');
  assert.equal(getExtensionFromSource('docx', 'informe.docx'), 'docx');
  assert.equal(getExtensionFromSource('md', 'README.md'), 'md');
  assert.equal(getExtensionFromSource('txt', 'notas.txt'), 'txt');
  assert.equal(getExtensionFromSource(null, 'documento.custom'), 'custom');
  assert.equal(getExtensionFromSource(null, 'sin_extension'), 'bin');
});

test('saveOriginalToR2 guarda archivos binarios y texto con metadatos en R2', async () => {
  const r2 = new MockR2Bucket();
  const env = { BACKUPS: r2 };
  const docId = 'doc-12345';
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

  const res = await saveOriginalToR2(env, docId, {
    bytes: pdfBytes,
    mime: 'application/pdf',
    type: 'pdf',
    name: 'Reporte.pdf',
    createdBy: 'user-001',
    createdAt: '2026-08-20T12:00:00.000Z',
  });

  assert.ok(res);
  assert.equal(res.key, `documents/${docId}/original.pdf`);

  const stored = await r2.get(`documents/${docId}/original.pdf`);
  assert.ok(stored);
  assert.equal(stored.httpMetadata.contentType, 'application/pdf');
  assert.equal(stored.customMetadata.documentId, docId);
  assert.equal(stored.customMetadata.sourceName, 'Reporte.pdf');
  assert.equal(stored.customMetadata.sourceType, 'pdf');
  assert.equal(stored.customMetadata.createdBy, 'user-001');
});

test('saveNormalizedBackupToR2 guarda document.md y metadata.json en R2', async () => {
  const r2 = new MockR2Bucket();
  const env = { BACKUPS: r2 };
  const docId = 'doc-67890';

  const res = await saveNormalizedBackupToR2(env, docId, {
    title: 'Minuta de Reunión',
    originalMarkdown: '# Minuta\n\nPuntos acordados...',
    pages: ['# Minuta\n\nPuntos acordados...'],
    sourceName: 'minuta.md',
    sourceType: 'md',
    sourceMime: 'text/markdown',
    importStatus: 'ready',
    hasSource: true,
    createdBy: 'user-002',
    createdAt: '2026-08-20T14:00:00.000Z',
  });

  assert.ok(res);
  assert.ok(res.ok);

  const mdObj = await r2.get(`documents/${docId}/document.md`);
  assert.ok(mdObj);
  assert.equal(await mdObj.text(), '# Minuta\n\nPuntos acordados...');

  const metaObj = await r2.get(`documents/${docId}/metadata.json`);
  assert.ok(metaObj);
  const metadata = JSON.parse(await metaObj.text());
  assert.equal(metadata.id, docId);
  assert.equal(metadata.title, 'Minuta de Reunión');
  assert.equal(metadata.importStatus, 'ready');
  assert.equal(metadata.createdBy, 'user-002');
});

test('getOriginalFromR2 y getNormalizedBackupFromR2 recuperan datos correctamente', async () => {
  const r2 = new MockR2Bucket();
  const env = { BACKUPS: r2 };
  const docId = 'doc-recup';

  await saveOriginalToR2(env, docId, {
    text: 'Contenido original plano',
    mime: 'text/plain',
    type: 'txt',
    name: 'notas.txt',
    createdBy: 'user-003',
  });

  await saveNormalizedBackupToR2(env, docId, {
    title: 'Notas de Trabajo',
    originalMarkdown: 'Contenido original plano',
    pages: ['Contenido original plano'],
    createdBy: 'user-003',
  });

  const orig = await getOriginalFromR2(env, docId);
  assert.ok(orig);
  assert.equal(orig.key, `documents/${docId}/original.txt`);
  assert.equal(new TextDecoder().decode(orig.bytes), 'Contenido original plano');

  const normalized = await getNormalizedBackupFromR2(env, docId);
  assert.ok(normalized);
  assert.equal(normalized.markdown, 'Contenido original plano');
  assert.equal(normalized.metadata.title, 'Notas de Trabajo');
});

test('restoreDocumentToD1 reconstruye un documento perdido en D1 a partir de R2', async () => {
  const r2 = new MockR2Bucket();
  const db = new MockD1Database();
  const env = { BACKUPS: r2, DB: db };
  const docId = 'doc-perdido-1';

  await saveNormalizedBackupToR2(env, docId, {
    title: 'Documento Rescatado',
    originalMarkdown: '# Rescate\n\nTexto restaurado...',
    pages: ['# Rescate\n\nTexto restaurado...'],
    sourceName: 'rescate.docx',
    sourceType: 'docx',
    sourceMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    importStatus: 'ready',
    hasSource: true,
    createdBy: 'user-004',
    createdAt: '2026-08-20T10:00:00.000Z',
  });

  // Verificar que D1 está inicialmente vacío para este doc
  assert.equal(db.documents.has(docId), false);

  const restored = await restoreDocumentToD1(env, docId);
  assert.ok(restored.ok);

  // Verificar que ahora D1 tiene el documento completo
  const docInDb = db.documents.get(docId);
  assert.ok(docInDb);
  assert.equal(docInDb.title, 'Documento Rescatado');
  assert.equal(docInDb.original_markdown, '# Rescate\n\nTexto restaurado...');
  assert.equal(docInDb.source_type, 'docx');
  assert.equal(docInDb.import_status, 'ready');
});

test('createDatabaseSnapshot y restoreDatabaseFromSnapshot exportan e importan D1 hacia/desde R2', async () => {
  const r2 = new MockR2Bucket();
  const db = new MockD1Database();
  const env = { BACKUPS: r2, DB: db };

  // Poblar base de datos inicial
  db.documents.set('doc-snap-1', {
    id: 'doc-snap-1',
    title: 'Doc 1',
    original_markdown: '# Doc 1 Content',
    pages: JSON.stringify(['# Doc 1 Content']),
    source_name: 'doc1.md',
    created_at: '2026-08-20T08:00:00.000Z',
    created_by: 'user-001',
    source_mime: 'text/markdown',
    source_type: 'md',
    import_status: 'ready',
  });

  db.boards.set('board-snap-1', {
    id: 'board-snap-1',
    guild_id: 'guild-123',
    name: 'Tablero Principal',
    description: 'Tablero de equipo',
    columns: JSON.stringify([{ id: 'backlog', name: 'Backlog', color: '#5865f2' }]),
    members: JSON.stringify([{ id: 'user-001', name: 'Max' }]),
    created_by: 'user-001',
    created_at: '2026-08-20T08:00:00.000Z',
    updated_at: '2026-08-20T08:00:00.000Z',
  });

  db.tasks.set('task-snap-1', {
    id: 'task-snap-1',
    board_id: 'board-snap-1',
    title: 'Tarea 1',
    description: 'Detalle de tarea',
    status: 'backlog',
    priority: 'high',
    assignee_id: 'user-001',
    assignee_name: 'Max',
    labels: JSON.stringify(['Sprint 1']),
    position: 0,
    created_by: 'user-001',
    created_at: '2026-08-20T08:00:00.000Z',
    updated_at: '2026-08-20T08:00:00.000Z',
  });

  // Ejecutar snapshot
  const snapshotRes = await createDatabaseSnapshot(env);
  assert.ok(snapshotRes);
  assert.ok(snapshotRes.ok);
  assert.equal(snapshotRes.counts.documents, 1);
  assert.equal(snapshotRes.counts.boards, 1);
  assert.equal(snapshotRes.counts.tasks, 1);

  // Listar snapshots
  const snapshots = await listDatabaseSnapshots(env);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].manifest.counts.documents, 1);

  // Simular pérdida total de D1
  const cleanDb = new MockD1Database();
  const restoreEnv = { BACKUPS: r2, DB: cleanDb };

  assert.equal(cleanDb.documents.size, 0);
  assert.equal(cleanDb.boards.size, 0);
  assert.equal(cleanDb.tasks.size, 0);

  // Restaurar desde snapshot
  const restoreResult = await restoreDatabaseFromSnapshot(restoreEnv, snapshotRes.snapshotPrefix);
  assert.ok(restoreResult.ok);
  assert.equal(restoreResult.restoredCounts.documents, 1);
  assert.equal(restoreResult.restoredCounts.boards, 1);
  assert.equal(restoreResult.restoredCounts.tasks, 1);

  assert.equal(cleanDb.documents.get('doc-snap-1').title, 'Doc 1');
  assert.equal(cleanDb.boards.get('board-snap-1').name, 'Tablero Principal');
  assert.equal(cleanDb.tasks.get('task-snap-1').title, 'Tarea 1');
});

test('Resiliencia: saveOriginalToR2 y saveNormalizedBackupToR2 manejan ausencia de BACKUPS sin lanzar error fatal', async () => {
  const envWithoutR2 = {};
  const res1 = await saveOriginalToR2(envWithoutR2, 'doc-x', { text: 'test', type: 'txt' });
  assert.equal(res1, null);

  const res2 = await saveNormalizedBackupToR2(envWithoutR2, 'doc-x', { title: 'test' });
  assert.equal(res2, null);
});
