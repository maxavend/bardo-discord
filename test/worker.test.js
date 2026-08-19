import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { generateKeyPairSync, sign } from 'node:crypto';

// Helper to generate ed25519 keypair for tests
function getTestKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublicKey = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  return { publicKey: rawPublicKey, privateKey };
}

function signBody(privateKey, timestamp, body) {
  const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(body, 'utf8')]);
  return sign(null, message, privateKey).toString('hex');
}

test('Worker rechaza requests que no sean POST', async () => {
  const req = new Request('http://localhost/', { method: 'GET' });
  const res = await worker.fetch(req, {});
  assert.equal(res.status, 405);
});

test('Worker rechaza requests sin firma', async () => {
  const req = new Request('http://localhost/', {
    method: 'POST',
    body: JSON.stringify({ type: 1 }),
  });
  const res = await worker.fetch(req, {});
  assert.equal(res.status, 401);
});

test('Worker responde a PING (Type 1) con PONG (Type 1)', async () => {
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
  assert.equal(json.type, 1); // PONG
});

test('Worker maneja botón de paginación consultando D1', async () => {
  const { publicKey, privateKey } = getTestKeys();
  const timestamp = String(Math.floor(Date.now() / 1000));

  const mockDb = {
    prepare(q) {
      return {
        bind(id) {
          return {
            async first() {
              if (id === 'msg-999') {
                return {
                  id: 'msg-999',
                  title: 'Documento Test',
                  original_markdown: 'Markdown test',
                  pages: JSON.stringify(['Página 1', 'Página 2']),
                  source_name: 'test.md',
                  created_at: new Date().toISOString(),
                  created_by: 'user-1',
                };
              }
              return null;
            },
          };
        },
      };
    },
  };

  const body = JSON.stringify({
    type: 3, // MESSAGE_COMPONENT
    data: {
      custom_id: 'bardo:page:1',
      component_type: 2,
    },
    message: {
      id: 'msg-999',
    },
  });

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

  const env = {
    DISCORD_PUBLIC_KEY: publicKey,
    DB: mockDb,
  };

  const res = await worker.fetch(req, env, { waitUntil: () => {} });
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.type, 7); // UPDATE_MESSAGE
  assert.ok(json.data.components.length > 0);
});
