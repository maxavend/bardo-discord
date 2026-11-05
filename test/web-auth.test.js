import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {handleDocsApi} from '../src/docs-api.js';
import {safeReturnTo} from '../src/web-auth.js';
import {cleanupWebAndMcp} from '../src/web-db.js';
import {CHANNEL, GUILD, USER, createEnv, createTestDb} from './helpers/sqlite-d1.js';
import {OTHER_GUILD_CHANNEL, PRIVATE_CHANNEL, WEB_ORIGIN, createBrowser, createWebEnv} from './helpers/web-fixtures.js';

test('con WEB_ORIGIN sin configurar, la web y el MCP no existen', async () => {
  const env = createEnv(createTestDb());
  for (const path of ['/auth/discord', '/api/web/session', '/oauth/authorize', '/.well-known/oauth-authorization-server', '/mcp']) {
    const response = await worker.fetch(new Request(`${WEB_ORIGIN}${path}`), env);
    assert.equal(response.status, 404, path);
  }
});

test('fuera de su origen, la web no responde (la Activity no cambia)', async () => {
  const {env} = createWebEnv();
  const response = await worker.fetch(new Request('https://otro.test/api/web/session'), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'web_disabled');
});

test('el inicio de sesión usa state, PKCE y solo el permiso identify', async () => {
  const {env} = createWebEnv();
  const browser = createBrowser(worker, env);
  const {start, authorize, callback} = await browser.login('/?guild=1&channel=2');
  assert.equal(start.status, 302);
  assert.equal(authorize.origin, 'https://discord.com');
  assert.equal(authorize.searchParams.get('scope'), 'identify');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorize.searchParams.get('redirect_uri'), `${WEB_ORIGIN}/auth/discord/callback`);
  assert.ok(authorize.searchParams.get('code_challenge'));
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/?guild=1&channel=2');

  const cookie = callback.headers.getSetCookie().find(line => line.startsWith('__Host-bardo_web='));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);

  const session = await browser.fetch('/api/web/session');
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.id, USER);
});

test('no se guarda el token de Discord ni la cookie en claro', async () => {
  const {db, env} = createWebEnv();
  const browser = createBrowser(worker, env);
  await browser.login();
  const [row] = db.rows('SELECT * FROM web_sessions');
  assert.equal(row.user_id, USER);
  assert.notEqual(row.token_hash, browser.jar.get('__Host-bardo_web'));
  assert.ok(!JSON.stringify(row).includes('discord-access'));
});

test('el state solo sirve una vez y en el navegador que empezó', async () => {
  const {env} = createWebEnv();
  const browser = createBrowser(worker, env);
  const start = await browser.fetch('/auth/discord');
  const state = new URL(start.headers.get('location')).searchParams.get('state');

  const stranger = createBrowser(worker, env);
  stranger.jar.set('__Host-bardo_web_login', 'otra-cosa');
  const forged = await stranger.fetch(`/auth/discord/callback?code=discord-code&state=${state}`);
  assert.equal(forged.headers.get('location'), '/?auth_error=expired');
  assert.equal(stranger.jar.has('__Host-bardo_web'), false);

  // El intento ajeno gastó el state: el de verdad ya tampoco entra.
  const replay = await browser.fetch(`/auth/discord/callback?code=discord-code&state=${state}`);
  assert.equal(replay.headers.get('location'), '/?auth_error=expired');
});

test('cancelar en Discord vuelve con un error legible y sin sesión', async () => {
  const {env} = createWebEnv();
  const browser = createBrowser(worker, env);
  const start = await browser.fetch('/auth/discord');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const response = await browser.fetch(`/auth/discord/callback?error=access_denied&state=${state}`);
  assert.equal(response.headers.get('location'), '/?auth_error=cancelled');
  assert.equal(browser.jar.has('__Host-bardo_web'), false);
});

test('return_to no permite salir del sitio', () => {
  assert.equal(safeReturnTo('https://evil.test/x'), '/');
  assert.equal(safeReturnTo('//evil.test/x'), '/');
  assert.equal(safeReturnTo('/\\evil.test'), '/');
  for (const path of ['/.//evil.test/x', '/..//evil.test/x', '/%2e//evil.test/x', '/././/evil.test']) {
    assert.equal(safeReturnTo(path), '/', path);
  }
  assert.equal(safeReturnTo('/oauth/authorize?a=1'), '/oauth/authorize?a=1');
});

test('el selector muestra solo servidores de la persona y canales que puede ver', async () => {
  const {env} = createWebEnv();
  const browser = createBrowser(worker, env);
  await browser.login();
  const response = await browser.fetch('/api/web/channels');
  assert.equal(response.status, 200);
  const {guilds} = await response.json();
  assert.deepEqual(guilds.map(guild => guild.name), ['Mi servidor']);
  assert.deepEqual(guilds[0].channels, [{id: CHANNEL, name: 'general', type: 0, category: 'General'}]);
});

test('sin sesión, la API web pide iniciar sesión', async () => {
  const {env} = createWebEnv();
  const browser = createBrowser(worker, env);
  for (const path of ['/api/web/channels', '/api/web/connections']) {
    assert.equal((await browser.fetch(path)).status, 401, path);
  }
  // No haber entrado no es un error: la consola queda limpia para quien visita.
  const session = await browser.fetch('/api/web/session');
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user, null);
});

test('el token de canal funciona en las APIs de siempre y comprueba Discord', async () => {
  const {env} = createWebEnv();
  const browser = createBrowser(worker, env);
  await browser.login();
  const open = (guildId, channelId, options) => browser.fetch('/api/web/channel-session', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({guildId, channelId}),
    ...options,
  });

  assert.equal((await open(GUILD, PRIVATE_CHANNEL)).status, 403, 'canal oculto');
  assert.equal((await open(GUILD, OTHER_GUILD_CHANNEL)).status, 403, 'canal de otro servidor');
  assert.equal((await open('../x', CHANNEL)).status, 400, 'id inválido');
  assert.equal((await open(GUILD, CHANNEL, {origin: 'https://evil.test'})).status, 403, 'otro origen');

  const opened = await open(GUILD, CHANNEL);
  assert.equal(opened.status, 200);
  const {bardo_token: token, user} = await opened.json();
  assert.equal(user.id, USER);

  const request = new Request(`${WEB_ORIGIN}/api/docs`, {headers: {Authorization: `Bearer ${token}`}});
  const docs = await handleDocsApi(request, new URL(request.url), env);
  assert.equal(docs.status, 200);
});

test('abrir canales e iniciar sesión tienen límite', async () => {
  const {env} = createWebEnv({userId: 'persona-con-prisa'});
  const browser = createBrowser(worker, env);
  await browser.login();
  let status = 0;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    status = (await browser.fetch('/api/web/channel-session', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({guildId: GUILD, channelId: PRIVATE_CHANNEL}),
    })).status;
  }
  assert.equal(status, 429);

  const visitor = createBrowser(worker, env);
  let location = '';
  for (let attempt = 0; attempt < 31; attempt += 1) {
    location = (await visitor.fetch('/auth/discord')).headers.get('location');
  }
  assert.equal(location, '/?auth_error=too_many');
});

test('cerrar sesión revoca también los tokens de canal', async () => {
  const {db, env} = createWebEnv();
  const browser = createBrowser(worker, env);
  await browser.login();
  await browser.fetch('/api/web/channel-session', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({guildId: GUILD, channelId: CHANNEL}),
  });
  assert.equal(db.rows('SELECT * FROM docs_sessions').length, 1);

  assert.equal((await browser.fetch('/api/web/logout', {method: 'POST', origin: 'https://evil.test'})).status, 403);
  assert.equal(db.rows('SELECT * FROM web_sessions').length, 1);

  assert.equal((await browser.fetch('/api/web/logout', {method: 'POST'})).status, 200);
  assert.equal(db.rows('SELECT * FROM web_sessions').length, 0);
  assert.equal(db.rows('SELECT * FROM docs_sessions').length, 0);
  assert.equal((await (await browser.fetch('/api/web/session')).json()).user, null);
});

test('una sesión vencida no sirve y la limpieza diaria la borra', async () => {
  const {db, env} = createWebEnv();
  const browser = createBrowser(worker, env);
  await browser.login();
  db.run("UPDATE web_sessions SET expires_at = '2020-01-01T00:00:00.000Z'");
  assert.equal((await (await browser.fetch('/api/web/session')).json()).user, null);
  await cleanupWebAndMcp(db);
  assert.equal(db.rows('SELECT * FROM web_sessions').length, 0);
});

const fakeAssets = () => {
  const requests = [];
  return {
    requests,
    fetch: async request => {
      requests.push(request);
      return new Response('<!doctype html><html lang="es"><head><title>Bardo</title></head></html>', {
        headers: {'Content-Type': 'text/html; charset=utf-8', ETag: '"abc"', 'Content-Length': '70'},
      });
    },
  };
};

test('solo el dominio web marca el HTML, y sin caché de antes de activar', async () => {
  const ASSETS = fakeAssets();
  const {env} = createWebEnv({}, {ASSETS});

  const web = await worker.fetch(new Request(`${WEB_ORIGIN}/`, {headers: {'If-None-Match': '"abc"'}}), env);
  assert.match(await web.text(), /<head><meta name="bardo-web" content="1"><title>/);
  assert.equal(web.headers.get('etag'), null);
  assert.equal(web.headers.get('content-length'), null);
  assert.equal(ASSETS.requests[0].headers.get('if-none-match'), null);

  const activity = await worker.fetch(new Request('https://otro.test/'), env);
  assert.doesNotMatch(await activity.text(), /bardo-web/);
  assert.equal(activity.headers.get('etag'), '"abc"');

  const off = createEnv(createTestDb(), {ASSETS: fakeAssets()});
  assert.doesNotMatch(await (await worker.fetch(new Request(`${WEB_ORIGIN}/`), off)).text(), /bardo-web/);
});

test('en localhost la cookie funciona sin HTTPS', async () => {
  const {env} = createWebEnv({}, {WEB_ORIGIN: 'http://localhost:8787'});
  const response = await worker.fetch(new Request('http://localhost:8787/auth/discord'), env);
  const cookie = response.headers.getSetCookie()[0];
  assert.match(cookie, /^bardo_web_login=/);
  assert.doesNotMatch(cookie, /Secure/);
});

test('un WEB_ORIGIN sin HTTPS fuera de localhost deja la web apagada', async () => {
  const {env} = createWebEnv({}, {WEB_ORIGIN: 'http://bardo.test'});
  const response = await worker.fetch(new Request('http://bardo.test/auth/discord'), env);
  assert.equal(response.status, 404);
});
