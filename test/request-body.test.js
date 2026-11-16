import test from 'node:test';
import assert from 'node:assert/strict';
import {readRequestBytes, readRequestText, RequestBodyTooLargeError} from '../src/request-body.js';

function streamedMessage(chunks, headers = {}) {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      const chunk = chunks[pulls++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { cancelled = true; },
  }, {highWaterMark: 0});
  return {message: {body, headers: new Headers(headers)}, pulls: () => pulls, cancelled: () => cancelled};
}

test('bounded body reads preserve exact bytes and split UTF-8 characters', async () => {
  const bytes = new TextEncoder().encode('á🙂');
  const binary = streamedMessage([bytes.subarray(0, 1), bytes.subarray(1)]);
  assert.deepEqual(await readRequestBytes(binary.message, bytes.byteLength), bytes);
  const text = streamedMessage([bytes.subarray(0, 3), bytes.subarray(3)]);
  assert.equal(await readRequestText(text.message, bytes.byteLength), 'á🙂');
});

test('bounded body reads cancel at the actual limit with absent or dishonest length', async () => {
  for (const headers of [{}, {'Content-Length': '1'}, {'Content-Length': '-1'}]) {
    const stream = streamedMessage([new Uint8Array(4), new Uint8Array(5), new Uint8Array(100)], headers);
    await assert.rejects(readRequestBytes(stream.message, 8), RequestBodyTooLargeError);
    assert.equal(stream.pulls(), 2, 'does not consume the rest of the body');
    assert.equal(stream.cancelled(), true);
  }
});

test('declared oversize bodies are cancelled without reading and empty bodies are supported', async () => {
  const stream = streamedMessage([new Uint8Array(100)], {'Content-Length': '100'});
  await assert.rejects(readRequestBytes(stream.message, 8), RequestBodyTooLargeError);
  assert.equal(stream.pulls(), 0);
  assert.equal(stream.cancelled(), true);
  assert.equal(await readRequestText(new Request('https://bardo.test'), 8), '');
  assert.equal(await readRequestText(new Response('ok'), 2), 'ok');
});

test('transport failures are not treated as a valid partial request', async () => {
  const failure = new Error('Connection interrupted');
  const message = {headers: new Headers(), body: new ReadableStream({
    start(controller) { controller.error(failure); },
  })};
  await assert.rejects(readRequestBytes(message, 8), failure);
});
