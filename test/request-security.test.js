import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {downloadAttachment} from '../src/worker.js';
import {boundRequestBody, enforcePublicRateLimit, enforceUserRateLimit} from '../src/request-security.js';
import {RequestBodyTooLargeError} from '../src/request-body.js';

function oversizedStream(size) {
  let reads = 0;
  let cancelled = false;
  return {
    stream: new ReadableStream({
      pull(controller) { reads++; controller.enqueue(new Uint8Array(size)); },
      cancel() { cancelled = true; },
    }, {highWaterMark: 0}),
    state: () => ({reads, cancelled}),
  };
}

for (const [path, maxBytes] of [
  ['/api/auth/token', 8192], ['/oauth/token', 8192], ['/oauth/authorize', 8192],
  ['/api/csp-report', 8192], ['/api/client-error', 8192], ['/api/settings/user', 8192], ['/api/web/channel-session', 8192],
  ['/api/planner/sessions', 512 * 1024], ['/api/kanban/cards', 64 * 1024],
  ['/api/docs', 4 * 1024 * 1024], ['/api/documents/d/normalize', 4 * 1024 * 1024],
  ['/mcp', 4 * 1024 * 1024], ['/', 256 * 1024],
]) {
  test(`Worker corta el body de ${path} antes de auth/DB/parsers aunque Content-Length mienta`, async () => {
    const source = oversizedStream(maxBytes + 1);
    let accessedDb = false;
    const response = await worker.fetch(new Request(`https://bardo.example${path}`, {
      method: 'POST', headers: {'Content-Length': '1'}, body: source.stream, duplex: 'half',
    }), {get DB() { accessedDb = true; throw new Error('must not reach DB'); }});
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, 'too_large');
    assert.deepEqual(source.state(), {reads: 1, cancelled: true});
    assert.equal(accessedDb, false);
  });
}

test('el guard conserva exactamente bytes y headers dentro del límite', async () => {
  const bytes = new Uint8Array([0, 0xff, 0xc3, 0xa1, 13, 10]);
  const request = await boundRequestBody(new Request('https://bardo.example/', {
    method: 'POST', headers: {'X-Signature-Timestamp': '123'}, body: bytes,
  }));
  assert.deepEqual(new Uint8Array(await request.arrayBuffer()), bytes);
  assert.equal(request.headers.get('X-Signature-Timestamp'), '123');
});

test('un adjunto detiene la descarga al pasar 1,8 MB, sin esperar al fin del stream', async () => {
  const source = oversizedStream(1_800_001);
  await assert.rejects(downloadAttachment({url: 'https://cdn.discordapp.com/file'}, 'markdown',
    async () => new Response(source.stream)), /supera 1,8 MB/);
  assert.deepEqual(source.state(), {reads: 1, cancelled: true});
});

test('un tamaño declarado excesivo se rechaza sin consumir el body', async () => {
  const source = oversizedStream(1);
  await assert.rejects(boundRequestBody(new Request('https://bardo.example/oauth/token', {
    method: 'POST', headers: {'Content-Length': '999999999'}, body: source.stream, duplex: 'half',
  })), RequestBodyTooLargeError);
  assert.deepEqual(source.state(), {reads: 0, cancelled: true});
});

test('un adjunto con Content-Length excesivo cancela el body antes de leerlo', async () => {
  const source = oversizedStream(1);
  await assert.rejects(downloadAttachment({url: 'https://cdn.discordapp.com/file'}, 'markdown',
    async () => new Response(source.stream, {headers: {'Content-Length': '1800001'}})), /supera 1,8 MB/);
  assert.deepEqual(source.state(), {reads: 0, cancelled: true});
});

test('rate limit usa ID autenticado compartido entre sesiones, sin datos de cabeceras', async () => {
  const keys = [];
  const env = {API_RATE_LIMITER: {async limit({key}) { keys.push(key); return {success: keys.length === 1}; }}};
  assert.equal(await enforceUserRateLimit(env, 'user-1'), null);
  const denied = await enforceUserRateLimit(env, 'user-1');
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('Retry-After'), '60');
  assert.deepEqual(keys, ['bardo:user:user-1', 'bardo:user:user-1']);
});

test('fallo del binding limita de forma recuperable en vez de permitir abuso', async () => {
  const response = await enforceUserRateLimit({API_RATE_LIMITER: {limit() { throw new Error('internal binding failure'); }}}, 'u');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '10');
  assert.doesNotMatch(await response.text(), /internal binding failure/);
});

test('el límite público ignora X-Forwarded-For y no agrupa tráfico autenticado por IP', async () => {
  const keys = [];
  const env = {AUTH_RATE_LIMITER: {async limit({key}) { keys.push(key); return {success: false}; }}};
  const request = (path, headers = {}) => new Request(`https://bardo.example${path}`, {headers});
  assert.equal(await enforcePublicRateLimit(request('/oauth/token', {'X-Forwarded-For': 'spoofed'}), env), null);
  assert.equal(await enforcePublicRateLimit(request('/api/docs', {'CF-Connecting-IP': 'trusted'}), env), null);
  const denied = await enforcePublicRateLimit(request('/oauth/token', {'CF-Connecting-IP': 'trusted', 'X-Forwarded-For': 'spoofed'}), env);
  assert.equal(denied.status, 429);
  assert.deepEqual(keys, ['bardo:oauth:trusted']);
});

test('el límite público se aplica antes de leer el body o consultar DB', async () => {
  const source = oversizedStream(1);
  const response = await worker.fetch(new Request('https://bardo.example/oauth/register', {
    method: 'POST', headers: {'CF-Connecting-IP': 'trusted'}, body: source.stream, duplex: 'half',
  }), {AUTH_RATE_LIMITER: {async limit() { return {success: false}; }}});
  assert.equal(response.status, 429);
  assert.equal(source.state().reads, 0);
  await source.stream.cancel();
});
