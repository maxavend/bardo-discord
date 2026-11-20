import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuardedDiscordSdk, isBoundedDiscordMessage, rpcSupportRef} from '../activity-app/src/discord-message-guard.js';

const participant = id => ({id: String(id), username: `Member ${id}`, discriminator: '0', flags: 0, bot: false});
const participantsFrame = participants => [1, {
  cmd: 'DISPATCH', evt: 'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', nonce: null, data: {participants},
}];

test('RPC budgets reject oversized arrays, nested values, strings and cycles before schema validation', () => {
  assert.equal(isBoundedDiscordMessage(participantsFrame(Array.from({length: 1000}, (_, index) => participant(index)))), true);
  assert.equal(isBoundedDiscordMessage(participantsFrame(Array(2049).fill(null))), false);
  assert.equal(isBoundedDiscordMessage([1, {text: 'a'.repeat(1024 * 1024 + 1)}]), false);
  let deep = null;
  for (let index = 0; index < 40; index += 1) deep = {next: deep};
  assert.equal(isBoundedDiscordMessage([1, deep]), false);
  const cycle = {};
  cycle.self = cycle;
  assert.equal(isBoundedDiscordMessage([1, cycle]), false);
  // Structured clone keeps shared references: repeating an object is not a cycle.
  const shared = [];
  assert.equal(isBoundedDiscordMessage([1, {a: shared, b: shared, c: {d: shared}}]), true);
  const manyValues = Array.from({length: 1000}, () => Array(32).fill(null));
  assert.equal(isBoundedDiscordMessage([1, manyValues]), false);
});

test('the installed Discord SDK still handshakes, becomes READY and resolves commands behind the guard', async () => {
  const original = {window: globalThis.window, document: globalThis.document};
  const posted = [];
  const host = {opener: null, postMessage: (...args) => posted.push(args)};
  const target = new EventTarget();
  Object.assign(target, {
    location: {origin: 'https://bardo.test', search: '?frame_id=f&instance_id=i&platform=desktop'},
    parent: host,
  });
  globalThis.window = target;
  globalThis.document = {referrer: 'https://discord.com/'};
  try {
    // Exercise the shipped SDK and its bundled Zod parser, not a mock parser.
    const {DiscordSDK} = await import('../activity-app/node_modules/@discord/embedded-app-sdk/output/Discord.mjs');
    const sdk = createGuardedDiscordSdk(DiscordSDK, 'test', {disableConsoleLogOverride: true}, target);
    assert.equal(posted[0][0][0], 0, 'SDK handshake reaches its original RPC host');
    assert.equal(sdk.source, host);
    let parseCalls = 0;
    const handleFrame = sdk.handleFrame.bind(sdk);
    sdk.handleFrame = payload => { parseCalls += 1; return handleFrame(payload); };
    const send = (data, {source = host, origin = 'https://discord.com'} = {}) => {
      const event = new Event('message');
      Object.assign(event, {data, source, origin});
      target.dispatchEvent(event);
    };
    send([1, {cmd: 'DISPATCH', evt: 'READY', nonce: null,
      data: {v: 1, config: {api_endpoint: '//discord.com/api', environment: 'production'}}}]);
    await sdk.ready();
    assert.equal(sdk.isReady, true);

    const authorized = sdk.commands.authorize({client_id: 'test', response_type: 'code', scope: ['identify'], state: ''});
    const nonce = posted.at(-1)[0][1].nonce;
    send([1, {cmd: 'AUTHORIZE', evt: null, nonce, data: {code: 'authorized-code'}}]);
    assert.deepEqual(await authorized, {code: 'authorized-code'});

    let received = null;
    sdk.eventBus.on('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', value => { received = value; });
    send(participantsFrame(Array.from({length: 1000}, (_, index) => participant(index))));
    assert.equal(received.participants.length, 1000);
    const before = parseCalls;
    send(participantsFrame(Array(2049).fill(null)));
    send(participantsFrame([participant('attacker')]), {origin: 'https://untrusted.test'});
    assert.equal(parseCalls, before, 'untrusted origins and oversized input never enter Zod');

    // Discord may answer from a window other than the one the SDK posts to.
    send(participantsFrame([participant('relayed')]), {source: {}});
    assert.equal(received.participants[0].id, 'relayed');

    // Some native clients have an opaque origin and no Window source.
    send(participantsFrame([participant('native')]), {source: null, origin: 'null'});
    assert.equal(received.participants[0].id, 'native');
    const beforeNative = parseCalls;
    send(participantsFrame(Array(2049).fill(null)), {source: null, origin: 'null'});
    assert.equal(parseCalls, beforeNative, 'native messages keep the same size bounds');
    sdk.close(1000, 'test complete');
  } finally {
    Object.assign(globalThis, original);
  }
});

test('the guard runs before the SDK listener and never filters by sender window', () => {
  const opener = {};
  const parent = {opener};
  const listeners = [];
  const target = {parent, addEventListener: (type, listener, options) => listeners.push({type, listener, options})};
  class SDK {
    constructor() { target.addEventListener('message', () => {}, false); }
  }
  createGuardedDiscordSdk(SDK, 'test', undefined, target);
  assert.deepEqual(listeners[0].options, {capture: true});
  let blocked = false;
  const event = {data: [0, {v: 1}], source: opener, stopImmediatePropagation: () => { blocked = true; }};
  for (const source of [opener, parent, {}, null]) listeners[0].listener({...event, source});
  assert.equal(blocked, false);
  listeners[0].listener({...event, data: [1, Array(2049).fill(null)]});
  assert.equal(blocked, true);
});

test('the support reference tells apart silence, a blocked message and a close from Discord', () => {
  const listeners = [];
  const target = {parent: {opener: null}, addEventListener: (type, listener) => listeners.push(listener)};
  createGuardedDiscordSdk(class {}, 'test', undefined, target);
  const count = name => Number(rpcSupportRef('R', target).match(new RegExp(`-${name}(\\d+)`))[1]);
  const before = {m: count('m'), b: count('b'), x: count('x')};
  const event = data => ({data, origin: 'https://discord.com', stopImmediatePropagation() {}});
  listeners[0](event([1, {cmd: 'DISPATCH', evt: 'READY'}]));
  listeners[0](event([1, Array(2049).fill(null)]));
  listeners[0]({...event([2, {code: 4003, message: 'x'}]), origin: 'https://untrusted.test'});
  assert.equal(count('m'), before.m + 3);
  assert.equal(count('b'), before.b + 1);
  assert.equal(count('x'), before.x + 1);
  assert.match(rpcSupportRef('R', target), /^R-m\d+-b\d+-x\d+-c4003-o0-re$/);
});
