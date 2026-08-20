import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

function createEditorDb({ contextUserId = 'user-1' } = {}) {
  const row = {
    id: 'doc-123',
    title: 'Documento Test',
    original_markdown: '# Documento Test\n\nContenido completo',
    pages: JSON.stringify(['Contenido completo']),
    source_name: 'test.md',
    created_at: '2026-08-20T12:00:00.000Z',
    created_by: 'user-1',
    updated_at: null,
    source_mime: null,
    source_type: 'markdown',
    import_status: 'ready',
    source_blob: null,
    discord_channel_id: null,
    discord_message_id: null,
  };
  const activityContexts = new Map([
    ['inst-123', {
      instance_id: 'inst-123',
      document_id: 'doc-123',
      created_at: '2026-08-20T12:00:00.000Z',
      user_id: contextUserId,
    }],
  ]);

  return {
    row,
    prepare(query) {
      return {
        bind(...params) {
          return {
            async first() {
              if (query.includes('FROM documents')) {
                return params[0] === 'doc-123' ? row : null;
              }
              if (query.includes('FROM activity_contexts')) {
                return activityContexts.get(params[0]) || null;
              }
              return null;
            },
            async run() {
              if (query.includes('UPDATE documents') && query.includes('SET title = ?')) {
                const [title, markdown, pages, updatedAt, id] = params;
                if (id === 'doc-123') {
                  row.title = title;
                  row.original_markdown = markdown;
                  row.pages = pages;
                  row.updated_at = updatedAt;
                  row.import_status = 'ready';
                  row.source_blob = null;
                }
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test('GET documento marca canEdit para el autor de la Activity', async () => {
  const db = createEditorDb();
  const req = new Request('http://localhost/api/documents/doc-123', {
    headers: { 'x-bardo-instance-id': 'inst-123' },
  });
  const res = await worker.fetch(req, { DB: db });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.canEdit, true);
});

test('PATCH guarda edición del autor y actualiza Markdown canónico', async () => {
  const db = createEditorDb();
  const req = new Request('http://localhost/api/documents/doc-123', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-bardo-instance-id': 'inst-123',
    },
    body: JSON.stringify({
      title: 'Documento editado',
      markdown: '# Documento editado\n\nTexto **nuevo**.',
    }),
  });

  const res = await worker.fetch(req, { DB: db });
  assert.equal(res.status, 200);
  assert.equal(db.row.title, 'Documento editado');
  assert.equal(db.row.original_markdown, '# Documento editado\n\nTexto **nuevo**.');
  assert.ok(db.row.updated_at);
});

test('PATCH rechaza edición desde una Activity de otro usuario', async () => {
  const db = createEditorDb({ contextUserId: 'user-2' });
  const req = new Request('http://localhost/api/documents/doc-123', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-bardo-instance-id': 'inst-123',
    },
    body: JSON.stringify({
      title: 'Intento ajeno',
      markdown: '# Intento ajeno\n\nNo debería guardarse.',
    }),
  });

  const res = await worker.fetch(req, { DB: db });
  assert.equal(res.status, 403);
  assert.equal(db.row.title, 'Documento Test');
});

test('finish no falla si el documento antiguo no tiene referencia de mensaje', async () => {
  const db = createEditorDb();
  const req = new Request('http://localhost/api/documents/doc-123/finish', {
    method: 'POST',
    headers: { 'x-bardo-instance-id': 'inst-123' },
  });

  const res = await worker.fetch(req, { DB: db });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json, { ok: true, synced: false });
});
