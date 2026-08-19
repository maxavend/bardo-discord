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
  return {
    prepare() {
      return {
        bind(id) {
          return {
            async first() {
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
