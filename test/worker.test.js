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

function createReadDb(documentId = 'doc-123') {
  const activityContexts = new Map([
    ['inst-123', { instance_id: 'inst-123', document_id: 'doc-123', created_at: '2026-08-19T12:00:00.000Z' }],
  ]);

  return {
    activityContexts,
    prepare(query) {
      return {
        bind(...params) {
          return {
            async first() {
              if (query.includes('FROM documents')) {
                const [id] = params;
                if (id !== documentId) return null;
                return {
                  id: documentId,
                  title: 'Documento Test',
                  original_markdown: '# Documento Test\n\nContenido completo',
                  pages: JSON.stringify(['Contenido completo']),
                  source_name: 'test.md',
                  created_at: '2026-08-19T12:00:00.000Z',
                  created_by: 'user-1',
                };
              }
              if (query.includes('FROM activity_contexts')) {
                const [instanceId] = params;
                return activityContexts.get(instanceId) || null;
              }
              return null;
            },
            async run() {
              if (query.includes('INSERT INTO activity_contexts')) {
                const [instance_id, document_id, created_at] = params;
                activityContexts.set(instance_id, {
                  instance_id,
                  document_id,
                  created_at,
                });
                return { success: true };
              }
              return { success: true };
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

test('Worker expone el documento completo para el lector embebido', async () => {
  const req = new Request('http://localhost/api/documents/doc-123', { method: 'GET' });
  const env = { DB: createReadDb() };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');

  const json = await res.json();
  assert.equal(json.id, 'doc-123');
  assert.equal(json.title, 'Documento Test');
  assert.equal(json.markdown, '# Documento Test\n\nContenido completo');
});

test('Worker responde 404 para documentos inexistentes', async () => {
  const req = new Request('http://localhost/api/documents/no-existe', { method: 'GET' });
  const env = { DB: createReadDb() };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 404);
});

test('Worker expone el contexto de activity por instanceId', async () => {
  const req = new Request('http://localhost/api/activity-context/inst-123', { method: 'GET' });
  const env = { DB: createReadDb() };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');

  const json = await res.json();
  assert.equal(json.instanceId, 'inst-123');
  assert.equal(json.documentId, 'doc-123');
});

test('Worker responde 404 para contextos de activity inexistentes', async () => {
  const req = new Request('http://localhost/api/activity-context/inst-no-existe', { method: 'GET' });
  const env = { DB: createReadDb() };

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 404);
});

test('Worker maneja MESSAGE_COMPONENT con bardo:open: lanzando Activity y guardando contexto', async () => {
  const { publicKey, privateKey } = getTestKeys();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const interactionPayload = {
    type: 3, // MESSAGE_COMPONENT
    id: 'interaction-987',
    token: 'token-abc',
    data: {
      custom_id: 'bardo:open:doc-456',
    },
  };
  const body = JSON.stringify(interactionPayload);
  const signature = signBody(privateKey, timestamp, body);

  const db = createReadDb();

  // Mock global fetch for Discord callback endpoint
  const originalFetch = globalThis.fetch;
  let calledCallbackUrl = null;
  let calledCallbackBody = null;

  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/interactions/interaction-987/token-abc/callback')) {
      calledCallbackUrl = String(url);
      calledCallbackBody = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          interaction: { id: 'interaction-987' },
          resource: {
            type: 12,
            activity_instance: {
              id: 'instance-created-999',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return originalFetch(url, options);
  };

  try {
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
    const res = await worker.fetch(req, env, { waitUntil: () => {} });

    assert.equal(res.status, 204);
    assert.ok(calledCallbackUrl.includes('with_response=true'));
    assert.equal(calledCallbackBody.type, 12);

    // Verify context was saved in DB
    const saved = db.activityContexts.get('instance-created-999');
    assert.ok(saved);
    assert.equal(saved.document_id, 'doc-456');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Worker delega assets GET cuando existe el binding ASSETS', async () => {
  const req = new Request('http://localhost/app.js', { method: 'GET' });
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
