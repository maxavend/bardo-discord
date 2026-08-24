import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { generateKeyPairSync, sign } from 'node:crypto';

function getTestKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublicKey = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  return { publicKey: rawPublicKey, privateKey };
}

function signBody(privateKey, timestamp, body) {
  const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(body, 'utf8')]);
  return sign(null, message, privateKey).toString('hex');
}

function createMockDb(initialDocs = []) {
  const documents = new Map();
  const guildAccess = new Map();
  const launchIntents = new Map();
  const sessions = new Map();
  const activityContexts = new Map([
    ['inst-123', { instance_id: 'inst-123', document_id: 'doc-123', created_at: '2026-08-19T12:00:00.000Z' }],
  ]);

  for (const doc of initialDocs) {
    documents.set(doc.id, doc);
  }

  return {
    documents,
    guildAccess,
    launchIntents,
    sessions,
    activityContexts,
    prepare(query) {
      return {
        bind(...params) {
          return {
            async first() {
              if (query.includes('FROM documents WHERE id = ?')) {
                const [id] = params;
                const doc = documents.get(id);
                if (!doc) return null;
                return {
                  id: doc.id,
                  title: doc.title,
                  description: doc.description || '',
                  original_markdown: doc.original_markdown || doc.originalMarkdown,
                  pages: JSON.stringify(doc.pages || ['']),
                  source_name: doc.source_name || doc.sourceName || null,
                  created_at: doc.created_at || doc.createdAt || '2026-08-19T12:00:00.000Z',
                  updated_at: doc.updated_at || doc.updatedAt || '2026-08-19T12:00:00.000Z',
                  created_by: doc.created_by || doc.createdBy || 'user-1',
                  source_mime: null,
                  source_type: 'markdown',
                  import_status: 'ready',
                  has_source: 0,
                };
              }
              if (query.includes('FROM activity_contexts')) {
                const [instanceId] = params;
                return activityContexts.get(instanceId) || null;
              }
              if (query.includes('FROM document_guild_access WHERE document_id = ? AND guild_id = ?')) {
                const [docId, guildId] = params;
                const key = `${docId}:${guildId}`;
                return guildAccess.has(key) ? { allowed: 1 } : null;
              }
              if (query.includes('FROM docs_sessions WHERE token_hash = ?')) {
                const [hash] = params;
                return sessions.get(hash) || null;
              }
              if (query.includes('FROM docs_launch_intents')) {
                const [userId, guildId] = params;
                const key = `${userId}:${guildId}`;
                return launchIntents.get(key) || null;
              }
              if (query.includes('COUNT(*) AS count FROM document_guild_access')) {
                return { count: guildAccess.size };
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
                      results.push({
                        id: doc.id,
                        title: doc.title,
                        description: doc.description || '',
                        original_markdown: doc.original_markdown || doc.originalMarkdown,
                        pages: JSON.stringify(doc.pages || []),
                        source_name: doc.source_name || doc.sourceName || null,
                        created_at: doc.created_at || doc.createdAt,
                        updated_at: doc.updated_at || doc.updatedAt,
                        created_by: doc.created_by || doc.createdBy,
                        source_mime: null,
                        source_type: 'markdown',
                        import_status: 'ready',
                        has_source: 0,
                      });
                    }
                  }
                }
                return { results };
              }
              return { results: [] };
            },
            async run() {
              if (query.includes('INSERT INTO documents')) {
                const [id, title, original_markdown, pages, source_name, created_at, created_by] = params;
                documents.set(id, { id, title, original_markdown, pages, source_name, created_at, created_by });
                return { meta: { changes: 1 } };
              }
              if (query.includes('INSERT INTO document_guild_access')) {
                if (query.includes('SELECT d.id, ?')) {
                  const [guildId, addedAt, addedBy] = params;
                  let count = 0;
                  for (const [docId, doc] of documents.entries()) {
                    const key = `${docId}:${guildId}`;
                    if (!guildAccess.has(key)) {
                      guildAccess.set(key, { document_id: docId, guild_id: guildId, added_at: addedAt, added_by: addedBy });
                      count += 1;
                    }
                  }
                  return { meta: { changes: count } };
                }
                const [document_id, guild_id, added_at, added_by] = params;
                guildAccess.set(`${document_id}:${guild_id}`, { document_id, guild_id, added_at, added_by });
                return { meta: { changes: 1 } };
              }
              if (query.includes('INSERT INTO docs_launch_intents')) {
                const [user_id, guild_id, document_id, created_at] = params;
                launchIntents.set(`${user_id}:${guild_id}`, { user_id, guild_id, document_id, created_at });
                return { meta: { changes: 1 } };
              }
              if (query.includes('INSERT INTO docs_sessions')) {
                const [token_hash, user_id, guild_id, username, avatar, created_at, expires_at] = params;
                sessions.set(token_hash, { token_hash, user_id, guild_id, username, avatar, created_at, expires_at });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

test('Worker mantiene 405 para métodos no soportados sin assets', async () => {
  const req = new Request('http://localhost/', { method: 'PUT' });
  const res = await worker.fetch(req, {});
  assert.equal(res.status, 405);
});

test('Worker rechaza requests POST sin firma', async () => {
  const req = new Request('http://localhost/', {
    method: 'POST',
    body: JSON.stringify({ type: 1 }),
  });
  const res = await worker.fetch(req, {});
  assert.equal(res.status, 401);
});

test('Worker responde a PING con PONG', async () => {
  const { publicKey, privateKey } = getTestKeys();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 1 });
  const signature = signBody(privateKey, timestamp, body);

  const req = new Request('http://localhost/', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
      'content-type': 'application/json',
    },
    body,
  });

  const env = { DISCORD_PUBLIC_KEY: publicKey };
  const res = await worker.fetch(req, env, { waitUntil: () => {} });
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.type, 1);
});

test('Worker responde inmediatamente con DEFERRED (type 5) para comando /doc', async () => {
  const { publicKey, privateKey } = getTestKeys();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const interactionPayload = {
    type: 2,
    id: 'cmd-interaction-1',
    token: 'token-cmd-1',
    application_id: '1539704001535156254',
    guild_id: 'guild-123',
    member: { user: { id: 'user-123' } },
    data: {
      name: 'doc',
      options: [{ name: 'archivo', value: 'att-1' }],
      resolved: {
        attachments: {
          'att-1': {
            id: 'att-1',
            filename: 'documento.md',
            size: 250,
            url: 'https://example.com/test.md',
          },
        },
      },
    },
  };

  const body = JSON.stringify(interactionPayload);
  const signature = signBody(privateKey, timestamp, body);
  let backgroundTask = null;

  const req = new Request('http://localhost/', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
      'content-type': 'application/json',
    },
    body,
  });

  const env = { DISCORD_PUBLIC_KEY: publicKey, DB: createMockDb() };
  const res = await worker.fetch(req, env, {
    waitUntil(p) { backgroundTask = p; },
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.type, 5); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  assert.ok(backgroundTask instanceof Promise);
});

test('Worker responde con error ephemeral si /doc no tiene archivo adjunto', async () => {
  const { publicKey, privateKey } = getTestKeys();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const interactionPayload = {
    type: 2,
    id: 'cmd-interaction-2',
    token: 'token-cmd-2',
    data: {
      name: 'doc',
      options: [],
    },
  };

  const body = JSON.stringify(interactionPayload);
  const signature = signBody(privateKey, timestamp, body);

  const req = new Request('http://localhost/', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
      'content-type': 'application/json',
    },
    body,
  });

  const env = { DISCORD_PUBLIC_KEY: publicKey, DB: createMockDb() };
  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.type, 4); // CHANNEL_MESSAGE_WITH_SOURCE
  assert.match(json.data.content, /archivo/);
});

test('Worker expone el documento completo para el lector embebido', async () => {
  const db = createMockDb([{
    id: 'doc-123',
    title: 'Documento Test',
    original_markdown: '# Documento Test\n\nContenido completo',
    pages: ['Contenido completo'],
  }]);
  const req = new Request('http://localhost/api/documents/doc-123', { method: 'GET' });
  const env = { DB: db };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');

  const json = await res.json();
  assert.equal(json.id, 'doc-123');
  assert.equal(json.title, 'Documento Test');
  assert.equal(json.markdown, '# Documento Test\n\nContenido completo');
});

test('Worker normaliza bardo:open: también en la API de documentos', async () => {
  const db = createMockDb([{
    id: 'doc-123',
    title: 'Documento Test',
    original_markdown: '# Documento Test\n\nContenido completo',
  }]);
  const req = new Request('http://localhost/api/documents/bardo%3Aopen%3Adoc-123', { method: 'GET' });
  const env = { DB: db };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.id, 'doc-123');
});

test('Worker exporta documento como markdown attachment', async () => {
  const db = createMockDb([{
    id: 'doc-123',
    title: 'Documento Test',
    original_markdown: '# Documento Test\n\nContenido completo',
  }]);
  const req = new Request('http://localhost/api/documents/doc-123/export?format=markdown', { method: 'GET' });
  const env = { DB: db };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.match(res.headers.get('content-disposition'), /attachment; filename=/);
  const text = await res.text();
  assert.equal(text, '# Documento Test\n\nContenido completo');
});

test('Worker exporta documento como docx attachment', async () => {
  const db = createMockDb([{
    id: 'doc-123',
    title: 'Documento Test',
    original_markdown: '# Documento Test\n\nContenido completo',
  }]);
  const req = new Request('http://localhost/api/documents/doc-123/export?format=docx', { method: 'GET' });
  const env = { DB: db };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.match(res.headers.get('content-disposition'), /attachment; filename=.*\.docx/);
  const buffer = await res.arrayBuffer();
  assert.ok(buffer.byteLength > 500);
});

test('Worker exporta documento como pdf attachment', async () => {
  const db = createMockDb([{
    id: 'doc-123',
    title: 'Documento Test',
    original_markdown: '# Documento Test\n\nContenido completo',
  }]);
  const req = new Request('http://localhost/api/documents/doc-123/export?format=pdf', { method: 'GET' });
  const env = { DB: db };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /attachment; filename=.*\.pdf/);
  const buffer = await res.arrayBuffer();
  assert.ok(buffer.byteLength > 500);
});

test('Worker responde 404 para documentos inexistentes', async () => {
  const req = new Request('http://localhost/api/documents/no-existe', { method: 'GET' });
  const env = { DB: createMockDb() };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 404);
});

test('Worker expone el contexto de activity por instanceId', async () => {
  const req = new Request('http://localhost/api/activity-context/inst-123', { method: 'GET' });
  const env = { DB: createMockDb() };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');

  const json = await res.json();
  assert.equal(json.instanceId, 'inst-123');
  assert.equal(json.documentId, 'doc-123');
});

test('Worker responde 404 para contextos de activity inexistentes', async () => {
  const req = new Request('http://localhost/api/activity-context/inst-no-existe', { method: 'GET' });
  const env = { DB: createMockDb() };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 404);
});

test('Worker responde LAUNCH_ACTIVITY inline y persiste el contexto fuera de la respuesta crítica', async () => {
  const { publicKey, privateKey } = getTestKeys();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const interactionPayload = {
    type: 3,
    id: 'interaction-987',
    token: 'token-abc',
    guild_id: 'guild-123',
    member: { user: { id: 'user-123' } },
    data: {
      custom_id: 'bardo:open:doc-123',
    },
  };
  const body = JSON.stringify(interactionPayload);
  const signature = signBody(privateKey, timestamp, body);
  const db = createMockDb([{
    id: 'doc-123',
    title: 'Doc 123',
    original_markdown: 'Content',
  }]);
  let background = null;

  const req = new Request('http://localhost/', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
      'content-type': 'application/json',
    },
    body,
  });

  const env = { DISCORD_PUBLIC_KEY: publicKey, DB: db };
  const res = await worker.fetch(req, env, {
    waitUntil(promise) {
      background = promise;
    },
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.type, 12);
  assert.ok(background instanceof Promise);
  await background;

  // Verificamos que se guardó el launch intent en segundo plano
  assert.equal(db.launchIntents.get('user-123:guild-123')?.document_id, 'doc-123');
});

test('Worker prioriza responder LAUNCH_ACTIVITY aunque el documento haya sido eliminado', async () => {
  const { publicKey, privateKey } = getTestKeys();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    type: 3,
    id: 'interaction-404',
    token: 'token-404',
    guild_id: 'guild-123',
    member: { user: { id: 'user-123' } },
    data: { custom_id: 'bardo:open:no-existe' },
  });
  const signature = signBody(privateKey, timestamp, body);
  let background = null;

  const req = new Request('http://localhost/', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
      'content-type': 'application/json',
    },
    body,
  });

  const res = await worker.fetch(
    req,
    { DISCORD_PUBLIC_KEY: publicKey, DB: createMockDb() },
    { waitUntil(promise) { background = promise; } },
  );

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.type, 12);
  if (background) await background;
});

test('Worker delega assets GET cuando existe el binding ASSETS', async () => {
  const req = new Request('http://localhost/assets/index.js', { method: 'GET' });
  const env = {
    ASSETS: {
      async fetch() {
        return new Response('asset-ok', { status: 200 });
      },
    },
  };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'asset-ok');
});
