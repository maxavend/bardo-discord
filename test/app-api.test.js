// Bardo Desktop: cliente OAuth de primera parte, /api/app/* y cierre de sesión.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {pkceChallenge, randomToken} from '../src/web-auth.js';
import {cleanupWebAndMcp} from '../src/web-db.js';
import {CHANNEL, GUILD} from './helpers/sqlite-d1.js';
import {PRIVATE_CHANNEL, WEB_ORIGIN, createBrowser, createWebEnv} from './helpers/web-fixtures.js';

const CLIENT_ID = 'bardo_desktop';
const REDIRECT_URI = 'http://127.0.0.1:53111/oauth/callback';
const APP_SCOPES = 'bardo:read bardo:write bardo:share bardo:app';

let nextAddress = 0;
function appFetch(env) {
  nextAddress += 1;
  const address = `192.0.2.${nextAddress}`;
  return (path, init = {}) => worker.fetch(new Request(new URL(path, WEB_ORIGIN), {
    ...init,
    headers: {'cf-connecting-ip': address, ...(init.headers || {})},
  }), env);
}

const form = values => ({
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: new URLSearchParams(values).toString(),
});
const bearer = token => ({headers: {Authorization: `Bearer ${token}`}});

function authorizeQuery({clientId = CLIENT_ID, scope = APP_SCOPES, challenge, state = 'estado-1'}) {
  return new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope,
    state,
  }).toString();
}

/** Lo que hace la app: abre el navegador, la persona confirma y la app canjea el código. */
async function signIn(context, {clientId = CLIENT_ID, scope = APP_SCOPES} = {}) {
  const browser = createBrowser(worker, context.env);
  const verifier = randomToken(48);
  const path = `/oauth/authorize?${authorizeQuery({clientId, scope, challenge: await pkceChallenge(verifier)})}`;
  let page = await browser.fetch(path);
  if (page.status === 302) {
    await browser.login(path);
    page = await browser.fetch(path);
  }
  assert.equal(page.status, 200);
  const html = await page.text();
  const consent = html.match(/name="consent" value="([^"]+)"/)[1];
  const answer = await browser.fetch('/oauth/authorize', form({consent, decision: 'allow'}));
  assert.equal(answer.status, 303);
  const location = new URL(answer.headers.get('location'));
  assert.equal(location.origin, 'http://127.0.0.1:53111');
  assert.equal(location.searchParams.get('state'), 'estado-1');
  const fetchApp = appFetch(context.env);
  const tokenResponse = await fetchApp('/oauth/token', form({
    grant_type: 'authorization_code',
    code: location.searchParams.get('code'),
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  }));
  assert.equal(tokenResponse.status, 200);
  return {browser, html, fetchApp, tokens: await tokenResponse.json()};
}

test('la app de escritorio inicia sesión con una confirmación de un clic', async () => {
  const context = createWebEnv();
  const {html, tokens} = await signIn(context);
  assert.match(html, /Continuar en Bardo Desktop/);
  assert.match(html, /value="switch"/);
  assert.ok(!html.includes('type="checkbox"'), 'una app de Bardo no pide permisos sueltos');
  assert.equal(tokens.scope, APP_SCOPES);
  assert.match(tokens.access_token, /^bardo_at_/);
  assert.match(tokens.refresh_token, /^bardo_rt_/);
});

test('con el token de la app se listan canales y se abre uno con su token por canal', async () => {
  const context = createWebEnv();
  const {fetchApp, tokens} = await signIn(context);

  const me = await fetchApp('/api/app/me', bearer(tokens.access_token));
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.username, 'Tester');

  const channels = await fetchApp('/api/app/channels', bearer(tokens.access_token));
  assert.equal(channels.status, 200);
  const listed = JSON.stringify(await channels.json());
  assert.match(listed, new RegExp(CHANNEL));
  assert.ok(!listed.includes(PRIVATE_CHANNEL), 'solo los canales que la persona ve');

  const opened = await fetchApp('/api/app/channel-session', {
    method: 'POST',
    headers: {Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({guildId: GUILD, channelId: CHANNEL}),
  });
  assert.equal(opened.status, 200);
  const channel = await opened.json();
  const ttl = Date.parse(channel.expires_at) - Date.now();
  assert.ok(ttl > 0 && ttl <= 24 * 60 * 60 * 1000, 'el token de canal de la app dura un día como máximo');
  const row = context.db.row('SELECT app_grant_id, web_session_hash FROM docs_sessions');
  assert.ok(row.app_grant_id);
  assert.equal(row.web_session_hash, null);

  const docs = await fetchApp('/api/docs', bearer(channel.bardo_token));
  assert.equal(docs.status, 200);

  const forbidden = await fetchApp('/api/app/channel-session', {
    method: 'POST',
    headers: {Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({guildId: GUILD, channelId: PRIVATE_CHANNEL}),
  });
  assert.equal(forbidden.status, 403);
});

test('cerrar sesión revoca la autorización y los tokens de canal que abrió', async () => {
  const context = createWebEnv();
  const {fetchApp, tokens} = await signIn(context);
  const opened = await fetchApp('/api/app/channel-session', {
    method: 'POST',
    headers: {Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({guildId: GUILD, channelId: CHANNEL}),
  });
  const {bardo_token: channelToken} = await opened.json();

  const metadata = await (await fetchApp('/.well-known/oauth-authorization-server')).json();
  assert.equal(metadata.revocation_endpoint, `${WEB_ORIGIN}/oauth/revoke`);

  // Otro cliente no puede revocar lo que no es suyo.
  const foreign = await fetchApp('/oauth/revoke', form({token: tokens.refresh_token, client_id: 'otro'}));
  assert.equal(foreign.status, 200);
  assert.equal((await fetchApp('/api/app/me', bearer(tokens.access_token))).status, 200);

  const revoked = await fetchApp('/oauth/revoke', form({token: tokens.refresh_token, client_id: CLIENT_ID}));
  assert.equal(revoked.status, 200);
  assert.equal((await fetchApp('/api/app/me', bearer(tokens.access_token))).status, 401);
  assert.equal((await fetchApp('/api/docs', bearer(channelToken))).status, 401);
  const refreshed = await fetchApp('/oauth/token', form({grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: CLIENT_ID}));
  assert.equal(refreshed.status, 400);

  // Un token desconocido no es un error (RFC 7009).
  assert.equal((await fetchApp('/oauth/revoke', form({token: 'nada', client_id: CLIENT_ID}))).status, 200);
});

test('la sesión de la app se renueva con el uso', async () => {
  const context = createWebEnv();
  const {fetchApp, tokens} = await signIn(context);
  const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  context.db.run('UPDATE mcp_grants SET expires_at = ?', soon);
  const refreshed = await fetchApp('/oauth/token', form({grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: CLIENT_ID}));
  assert.equal(refreshed.status, 200);
  const {expires_at: expiresAt} = context.db.row('SELECT expires_at FROM mcp_grants');
  assert.ok(Date.parse(expiresAt) - Date.now() > 80 * 24 * 60 * 60 * 1000);
  const refreshRow = context.db.row("SELECT expires_at FROM mcp_tokens WHERE kind = 'refresh' AND used_at IS NULL");
  assert.ok(Date.parse(refreshRow.expires_at) - Date.now() > 80 * 24 * 60 * 60 * 1000, 'el refresh de la app no caduca a los 30 días');
});

test('un cliente MCP de terceros no obtiene bardo:app ni usa /api/app', async () => {
  const context = createWebEnv();
  const fetchApp = appFetch(context.env);
  const registered = await (await fetchApp('/oauth/register', {
    method: 'POST',
    body: JSON.stringify({client_name: 'Bardo Desktop', redirect_uris: [REDIRECT_URI]}),
  })).json();
  const {html, tokens} = await signIn(context, {clientId: registered.client_id});
  assert.match(html, /no puede verificarlo/, 'un tercero con el mismo nombre ve la pantalla normal');
  assert.ok(!tokens.scope.includes('bardo:app'));
  assert.equal((await fetchApp('/api/app/me', bearer(tokens.access_token))).status, 403);
  assert.equal((await fetchApp('/api/app/channels', bearer(tokens.access_token))).status, 403);
});

test('«Usar otra cuenta» cierra la sesión del navegador y vuelve a pasar por Discord', async () => {
  const context = createWebEnv();
  const browser = createBrowser(worker, context.env);
  const path = `/oauth/authorize?${authorizeQuery({challenge: await pkceChallenge(randomToken(48))})}`;
  await browser.login(path);
  const html = await (await browser.fetch(path)).text();
  const consent = html.match(/name="consent" value="([^"]+)"/)[1];
  const switched = await browser.fetch('/oauth/authorize', form({consent, decision: 'switch'}));
  assert.equal(switched.status, 303);
  const location = new URL(switched.headers.get('location'), WEB_ORIGIN);
  assert.equal(location.pathname, '/auth/discord');
  assert.equal(location.searchParams.get('prompt'), 'consent');
  assert.match(location.searchParams.get('return_to'), /^\/oauth\/authorize\?client_id=bardo_desktop/);
  assert.equal(context.db.rows('SELECT * FROM web_sessions').length, 0);

  const start = await browser.fetch(location.pathname + location.search);
  assert.equal(new URL(start.headers.get('location')).searchParams.get('prompt'), 'consent');
});

test('la versión mínima es pública y la limpieza diaria conserva el cliente de escritorio', async () => {
  const context = createWebEnv({}, {DESKTOP_MIN_VERSION: '0.2.0'});
  const version = await (await appFetch(context.env)('/api/app/version')).json();
  assert.equal(version.minDesktopVersion, '0.2.0');
  await cleanupWebAndMcp(context.db, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
  assert.ok(context.db.row("SELECT client_id FROM mcp_clients WHERE client_id = 'bardo_desktop'"));
});

test('sin WEB_ORIGIN la API de la app no existe', async () => {
  const context = createWebEnv({}, {WEB_ORIGIN: ''});
  const response = await appFetch(context.env)('/api/app/version');
  assert.equal(response.status, 404);
});
