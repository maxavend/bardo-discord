import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDocsApi } from '../src/docs-api.js';

function hashTokenSync(token) {
  // Simple deterministic hash for testing mock
  return `hash_${token}`;
}

function createDocsMockDb() {
  const documents = new Map([
    ['doc-1', {
      id: 'doc-1',
      title: 'Doc Uno',
      description: 'Desc',
      original_markdown: '# Doc Uno\n\nCuerpo 1',
      pages: JSON.stringify(['Cuerpo 1']),
      source_name: null,
      created_at: '2026-08-20T10:00:00.000Z',
      updated_at: '2026-08-20T10:00:00.000Z',
      archived_at: null,
      created_by: 'user-1',
      source_mime: null,
      source_type: 'markdown',
      import_status: 'ready',
      has_source: 0,
    }],
    ['doc-legacy', {
      id: 'doc-legacy',
      title: 'Doc Legacy',
      description: '',
      original_markdown: '# Doc Legacy\n\nAntiguo',
      pages: JSON.stringify(['Antiguo']),
      source_name: null,
      created_at: '2026-08-19T10:00:00.000Z',
      updated_at: '2026-08-19T10:00:00.000Z',
      archived_at: null,
      created_by: 'user-1',
      source_mime: null,
      source_type: 'markdown',
      import_status: 'ready',
      has_source: 0,
    }],
  ]);

  const guildAccess = new Map([
    ['doc-1:guild-123', { document_id: 'doc-1', guild_id: 'guild-123' }],
  ]);

  const launchIntents = new Map([
    ['user-123:guild-123', { user_id: 'user-123', guild_id: 'guild-123', document_id: 'doc-1', created_at: new Date().toISOString() }],
  ]);

  // Valid active session token
  const validToken = 'valid-token-xyz';

  const executeQuery = (query, params = []) => ({
    async first() {
      if (query.includes('FROM docs_sessions WHERE token_hash = ?')) {
        const [hash] = params;
        return {
          token_hash: hash,
          user_id: 'user-123',
          guild_id: 'guild-123',
          username: 'TestUser',
          avatar: null,
          created_at: '2026-08-24T10:00:00.000Z',
          expires_at: '2026-08-25T10:00:00.000Z',
        };
      }
      if (query.includes('FROM documents WHERE id = ?')) {
        const [id] = params;
        return documents.get(id) || null;
      }
      if (query.includes('FROM document_guild_access WHERE document_id = ? AND guild_id = ?')) {
        const [docId, guildId] = params;
        return guildAccess.has(`${docId}:${guildId}`) ? { allowed: 1 } : null;
      }
      if (query.includes('FROM docs_launch_intents')) {
        const [userId, guildId] = params;
        return launchIntents.get(`${userId}:${guildId}`) || null;
      }
      if (query.includes('COUNT(*) AS count FROM document_guild_access')) {
        return { count: guildAccess.size };
      }
      if (query.includes('COUNT(DISTINCT guild_id) AS guild_count')) {
        return { guild_count: 1, guild_id: 'guild-123' };
      }
      return null;
    },
    async all() {
      if (query.includes('FROM documents d') && query.includes('INNER JOIN document_guild_access a')) {
        const [guildId] = params;
        const results = [];
        for (const [key, access] of guildAccess.entries()) {
          if (access.guild_id === guildId) {
            const doc = documents.get(access.document_id);
            if (doc && !doc.archived_at) {
              results.push(doc);
            }
          }
        }
        return { results };
      }
      return { results: [] };
    },
    async run() {
      if (query.includes('INSERT INTO document_guild_access')) {
        if (query.includes('SELECT d.id, ?')) {
          const [guildId, addedAt, addedBy] = params;
          for (const [docId, doc] of documents.entries()) {
            guildAccess.set(`${docId}:${guildId}`, { document_id: docId, guild_id: guildId });
          }
          return { meta: { changes: 1 } };
        }
        const [document_id, guild_id] = params;
        guildAccess.set(`${document_id}:${guild_id}`, { document_id, guild_id });
        return { meta: { changes: 1 } };
      }
      if (query.includes('INSERT INTO documents')) {
        const [id, title, original_markdown, pages, source_name, created_at, created_by] = params;
        documents.set(id, { id, title, original_markdown, pages, created_at, created_by });
        return { meta: { changes: 1 } };
      }
      if (query.includes('UPDATE documents') && query.includes('title = ?')) {
        const [title, description, original_markdown, pages, updated_at, documentId] = params;
        const existing = documents.get(documentId) || {};
        documents.set(documentId, { ...existing, title, description, original_markdown, pages, updated_at });
        return { meta: { changes: 1 } };
      }
      if (query.includes('UPDATE documents') && query.includes('archived_at = ?')) {
        const [archivedAt, updatedAt, documentId] = params;
        const existing = documents.get(documentId) || {};
        documents.set(documentId, { ...existing, archived_at: archivedAt, updated_at: updatedAt });
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 1 } };
    },
  });

  return {
    documents,
    guildAccess,
    launchIntents,
    validToken,
    prepare(query) {
      const base = executeQuery(query, []);
      return {
        ...base,
        bind(...params) {
          return executeQuery(query, params);
        },
      };
    },
  };
}

test('handleDocsApi rechaza requests sin sesión autenticada', async () => {
  const req = new Request('http://localhost/api/docs');
  const url = new URL(req.url);
  const db = createDocsMockDb();
  const res = await handleDocsApi(req, url, { DB: db });
  assert.equal(res.status, 401);
});

test('handleDocsApi devuelve la lista de documentos accesibles para el guild de la sesión', async () => {
  const db = createDocsMockDb();
  const req = new Request('http://localhost/api/docs', {
    headers: { Authorization: `Bearer ${db.validToken}` },
  });
  const url = new URL(req.url);
  const res = await handleDocsApi(req, url, { DB: db });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(Array.isArray(data.documents));
  assert.equal(data.guildId, 'guild-123');
  assert.equal(data.user.id, 'user-123');
  assert.ok(data.documents.some(d => d.id === 'doc-1'));
});

test('handleDocsApi resuelve contextDocumentId desde header x-bardo-custom-id', async () => {
  const db = createDocsMockDb();
  const req = new Request('http://localhost/api/docs', {
    headers: {
      Authorization: `Bearer ${db.validToken}`,
      'x-bardo-custom-id': 'bardo:open:doc-1',
    },
  });
  const url = new URL(req.url);
  const res = await handleDocsApi(req, url, { DB: db });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.contextDocumentId, 'doc-1');
});

test('handleDocsApi crea un nuevo documento vía POST y le otorga acceso al guild', async () => {
  const db = createDocsMockDb();
  const newDoc = {
    title: 'Nuevo Documento',
    markdown: '# Nuevo Documento\n\nContenido nuevo',
  };
  const req = new Request('http://localhost/api/docs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${db.validToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(newDoc),
  });
  const url = new URL(req.url);
  const res = await handleDocsApi(req, url, { DB: db });
  assert.equal(res.status, 201);

  const created = await res.json();
  assert.equal(created.title, 'Nuevo Documento');
  assert.ok(created.id);
  assert.ok(db.guildAccess.has(`${created.id}:guild-123`));
});

test('handleDocsApi actualiza un documento existente vía PATCH si el guild tiene acceso', async () => {
  const db = createDocsMockDb();
  const updatePayload = {
    title: 'Doc Uno Actualizado',
    markdown: '# Doc Uno Actualizado\n\nCuerpo actualizado',
  };
  const req = new Request('http://localhost/api/docs/doc-1', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${db.validToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatePayload),
  });
  const url = new URL(req.url);
  const res = await handleDocsApi(req, url, { DB: db });
  assert.equal(res.status, 200);

  const updated = await res.json();
  assert.equal(updated.title, 'Doc Uno Actualizado');
});

test('handleDocsApi rechaza acceso a documento no compartido con el guild', async () => {
  const db = createDocsMockDb();
  const req = new Request('http://localhost/api/docs/doc-privado-ajeno', {
    headers: {
      Authorization: `Bearer ${db.validToken}`,
    },
  });
  const url = new URL(req.url);
  const res = await handleDocsApi(req, url, { DB: db });
  assert.equal(res.status, 403);
});
