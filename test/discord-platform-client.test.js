import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

// Execute the real bootstrap with only Discord's host RPC replaced. A cached
// browser token must never release another account's data before current OAuth.
test('Activity launch authenticates the current Discord account before loading any data', async () => {
  const bundle = await build({
    entryPoints: ['activity-app/src/production-discord-auth.js'], bundle: true,
    format: 'esm', write: false, platform: 'browser', plugins: [{name: 'sdk-host', setup(builder) {
      builder.onResolve({filter: /^@discord\/embedded-app-sdk$/}, () => ({path: 'sdk', namespace: 'fixture'}));
      builder.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: 'export const DiscordSDK = window.TestDiscordSDK;'}));
    }}],
  });
  const requests = [];
  const cached = new Map([['bardo_sessions_v2', JSON.stringify({version: 2, sessions: {'g:c': {
    token: 'old-user-token', user: {id: 'old-user'}, guildId: 'g', channelId: 'c', expiresAt: '2099-01-01',
  }}})]]);
  const original = {window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch};
  const fetchMock = async (url, init) => {
    requests.push({url, init});
    assert.equal(url, '/api/auth/token', 'must not load Docs with a persisted token');
    return Response.json({access_token: 'oauth', bardo_token: 'current-token', user: {id: 'current-user'}});
  };
  globalThis.window = {
    location: {href: 'https://example.com/?instance_id=i', origin: 'https://example.com', hostname: 'example.com', search: '?instance_id=i'},
    fetch: fetchMock,
    TestDiscordSDK: class {
      guildId = 'g'; channelId = 'c'; instanceId = 'i';
      ready = async () => {};
      commands = {authorize: async args => { assert.deepEqual(args.scope, ['identify']); return {code: 'fresh'}; },
        authenticate: async () => ({user: {id: 'current-user', username: 'Current'}})};
    },
  };
  globalThis.localStorage = {getItem: key => cached.get(key), removeItem: key => cached.delete(key)};
  globalThis.fetch = fetchMock;
  try {
    const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    const result = await mod.authenticateBardoDiscord();
    assert.equal(result.ready, true);
    assert.equal(result.user.id, 'current-user');
    assert.equal(result.sessionToken, 'current-token');
    assert.equal(requests.length, 1);
    assert.equal(cached.has('bardo_sessions_v2'), false);
  } finally { Object.assign(globalThis, original); }
});

test('authorize: quien ya autorizó no ve el modal; la primera vez sí', async () => {
  const bundle = await build({
    entryPoints: ['activity-app/src/production-discord-auth.js'], bundle: true,
    format: 'esm', write: false, platform: 'browser', plugins: [{name: 'sdk-host', setup(builder) {
      builder.onResolve({filter: /^@discord\/embedded-app-sdk$/}, () => ({path: 'sdk', namespace: 'fixture'}));
      builder.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: 'export const DiscordSDK = null;'}));
    }}],
  });
  const original = globalThis.window;
  globalThis.window = {location: {hostname: 'example.com', search: ''}};
  try {
    const {authorizeWithDiscord} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    const calls = [];
    const authorized = {commands: {authorize: async args => { calls.push(args.prompt ?? 'consent'); return {code: 'silent'}; }}};
    assert.deepEqual(await authorizeWithDiscord(authorized, 'app'), {code: 'silent'});
    assert.deepEqual(calls, ['none']);

    calls.length = 0;
    const firstTime = {commands: {authorize: async args => {
      calls.push(args.prompt ?? 'consent');
      if (args.prompt === 'none') throw Object.assign(new Error('not authorized'), {code: 5000});
      return {code: 'consented'};
    }}};
    assert.deepEqual(await authorizeWithDiscord(firstTime, 'app'), {code: 'consented'});
    assert.deepEqual(calls, ['none', 'consent']);
  } finally { globalThis.window = original; }
});

test('API interceptor only attaches credentials to the same origin and clears stale launch context', async () => {
  const original = globalThis.window;
  const calls = [];
  globalThis.window = {location: {origin: 'https://bardo.example', href: 'https://bardo.example/'},
    fetch: async (input, init) => { calls.push({input, init}); return Response.json({}); }};
  try {
    const source = await readFile(new URL('../activity-app/src/production-launch-auth.js', import.meta.url), 'utf8');
    const {installBardoApiSession} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    installBardoApiSession({token: 'private-token', customId: 'bardo:open:doc-old'});
    await window.fetch('https://external.example/api/docs');
    assert.equal(calls[0].init.headers, undefined);
    await window.fetch('/api/discord/members?query=Alex');
    assert.equal(calls[1].init.headers.get('Authorization'), 'Bearer private-token');
    installBardoApiSession({token: 'new-token', customId: null});
    await window.fetch(new Request('https://bardo.example/api/docs', {headers: {'X-Old': 'old'}}), {headers: {'X-New': 'new'}});
    const request = calls[2].input;
    assert.equal(request.headers.get('x-bardo-custom-id'), null);
    assert.equal(request.headers.get('Authorization'), 'Bearer new-token');
    assert.equal(request.headers.get('X-New'), 'new');
    assert.equal(request.headers.get('X-Old'), null);
  } finally { globalThis.window = original; }
});

test('«Intentar de nuevo» reutiliza la conexión con Discord y conserva el error real', async () => {
  const bundle = await build({
    entryPoints: ['activity-app/src/production-discord-auth.js'], bundle: true,
    format: 'esm', write: false, platform: 'browser', plugins: [{name: 'sdk-host', setup(builder) {
      builder.onResolve({filter: /^@discord\/embedded-app-sdk$/}, () => ({path: 'sdk', namespace: 'fixture'}));
      builder.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: 'export const DiscordSDK = window.TestDiscordSDK;'}));
    }}],
  });
  const original = {window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch};
  let handshakes = 0;
  const message = 'Bardo no puede ver este canal. Pide a quien administra el servidor que añada el rol Bardo en los permisos del canal.';
  globalThis.window = {
    location: {href: 'https://example.com/?instance_id=i', origin: 'https://example.com', hostname: 'example.com', search: '?instance_id=i'},
    TestDiscordSDK: class {
      guildId = 'g'; channelId = 'c'; instanceId = 'i';
      // Como Discord: READY llega solo al primer SDK del iframe.
      mine = (handshakes += 1);
      ready = () => (this.mine === 1 ? Promise.resolve() : new Promise(() => {}));
      commands = {authorize: async () => ({code: 'fresh'})};
    },
  };
  globalThis.localStorage = {getItem: () => null, removeItem: () => {}};
  globalThis.fetch = async () => Response.json({error: 'bot_channel_forbidden', message}, {status: 403});
  try {
    // Módulo propio: el SDK compartido vive en el módulo y otra prueba ya importó este mismo bundle.
    const source = `${bundle.outputFiles[0].text}\n// retry-fixture`;
    const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const first = await mod.authenticateBardoDiscord();
    const retry = await mod.authenticateBardoDiscord();
    assert.equal(handshakes, 1, 'el reintento no abre un segundo SDK');
    for (const result of [first, retry]) {
      assert.equal(result.ready, false);
      assert.equal(result.message, message, 'sin «Inténtalo de nuevo en unos segundos» para un 403');
    }
  } finally { Object.assign(globalThis, original); }
});
