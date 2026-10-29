import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from './index.js';
import {SECURITY_HEADERS} from './security.js';

const noBindings = new Proxy({}, {get() { throw new Error('API must not access bindings'); }});
for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
  test(`${method} retired waitlist never reads the body or touches storage`, async () => {
    const request = new Request('https://bardo.example/api/lista-de-espera', {method});
    request.json = () => { throw new Error('Body must not be parsed'); };
    const response = await worker.fetch(request, noBindings);
    assert.equal(response.status, 410);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(response.headers.get(name), value);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (method === 'HEAD') assert.equal(await response.text(), '');
  });
}
test('unknown APIs and mutation methods cannot fall through to assets', async () => {
  assert.equal((await worker.fetch(new Request('https://bardo.example/api/unknown'), noBindings)).status, 404);
  assert.equal((await worker.fetch(new Request('https://bardo.example/', {method:'POST'}), noBindings)).status, 405);
});
test('fallback asset responses and static header file carry the same protections', async () => {
  const response = await worker.fetch(new Request('https://bardo.example/missing'), {ASSETS: {fetch: async () => new Response('missing', {status:404})}});
  const headersFile = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(response.headers.get(name), value);
    assert(headersFile.includes(`${name}: ${value}`));
  }
  assert.equal(response.status,404);
});
