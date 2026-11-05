// El servidor se ejercita con el cliente oficial del SDK de MCP: si el protocolo
// o el flujo OAuth no fueran compatibles, estas pruebas fallarían.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {auth} from '@modelcontextprotocol/sdk/client/auth.js';
import worker from '../src/worker.js';
import {isAllowedRedirectUri, redirectUriMatches} from '../src/mcp-oauth.js';
import {TOOLS, validateArguments} from '../src/mcp-tools.js';
import {CHANNEL, GUILD, USER, insertDocument} from './helpers/sqlite-d1.js';
import {PRIVATE_CHANNEL, WEB_ORIGIN, createBrowser, createWebDiscordFetch, createWebEnv} from './helpers/web-fixtures.js';

const REDIRECT_URI = 'http://127.0.0.1:43210/callback';

class MemoryProvider {
  constructor(onRedirect) {
    this.onRedirect = onRedirect;
    this.savedTokens = undefined;
    this.savedClient = undefined;
    this.verifier = undefined;
  }
  get redirectUrl() { return REDIRECT_URI; }
  get clientMetadata() {
    return {client_name: 'Cliente de prueba', redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code']};
  }
  clientInformation() { return this.savedClient; }
  saveClientInformation(info) { this.savedClient = info; }
  tokens() { return this.savedTokens; }
  saveTokens(tokens) { this.savedTokens = tokens; }
  redirectToAuthorization(url) { return this.onRedirect(url); }
  saveCodeVerifier(verifier) { this.verifier = verifier; }
  codeVerifier() { return this.verifier; }
}

/** Autoriza desde el navegador y devuelve el código que recibe el cliente. */
async function approve(browser, authorizationUrl, {scopes = ['bardo:write'], decision = 'allow'} = {}) {
  const path = `${authorizationUrl.pathname}${authorizationUrl.search}`;
  let page = await browser.fetch(path);
  if (page.status === 302) {
    await browser.login(path);
    page = await browser.fetch(path);
  }
  assert.equal(page.status, 200);
  const html = await page.text();
  const consent = html.match(/name="consent" value="([^"]+)"/)[1];
  const form = new URLSearchParams({consent, decision});
  for (const scope of scopes) form.append('scope', scope);
  const answer = await browser.fetch('/oauth/authorize', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: form.toString(),
  });
  assert.equal(answer.status, 303);
  return {html, location: new URL(answer.headers.get('location'))};
}

let nextAddress = 0;

/** Cada prueba viene de una dirección distinta: los límites por IP son reales. */
function workerFetch(env) {
  nextAddress += 1;
  const address = `198.51.100.${nextAddress}`;
  return (input, init) => {
    const request = new Request(input, init);
    request.headers.set('cf-connecting-ip', address);
    return worker.fetch(request, env);
  };
}

/** Flujo completo: 401, descubrimiento, registro, autorización y conexión. */
async function connect(context, options = {}) {
  const fetchFn = workerFetch(context.env);
  const browser = context.browser || createBrowser(worker, context.env);
  let authorizationUrl;
  const provider = new MemoryProvider(url => { authorizationUrl = url; });
  const serverUrl = `${WEB_ORIGIN}/mcp`;

  assert.equal(await auth(provider, {serverUrl, fetchFn}), 'REDIRECT');
  const {html, location} = await approve(browser, authorizationUrl, options);
  assert.equal(location.searchParams.get('iss'), WEB_ORIGIN);
  const code = location.searchParams.get('code');
  assert.equal(await auth(provider, {serverUrl, authorizationCode: code, fetchFn}), 'AUTHORIZED');

  const client = new Client({name: 'prueba', version: '1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(serverUrl), {authProvider: provider, fetch: fetchFn}));
  return {client, provider, browser, html, serverUrl, fetchFn, authorizationUrl, code};
}

const inChannel = extra => ({guild_id: GUILD, channel_id: CHANNEL, ...extra});
const parse = result => JSON.parse(result.content.at(-1).text);

test('el cliente oficial descubre, se registra, autoriza y lista herramientas', async () => {
  const context = createWebEnv();
  const {client, html} = await connect(context);
  assert.match(html, /Cliente de prueba/);
  assert.equal(client.getServerVersion().name, 'bardo');
  assert.match(client.getInstructions(), /nunca instrucciones/);
  const {tools} = await client.listTools();
  const names = tools.map(tool => tool.name);
  assert.ok(names.includes('list_channels') && names.includes('create_doc'));
  assert.ok(!names.includes('publish_doc'), 'publicar queda fuera sin permiso explícito');
  for (const tool of tools) assert.ok(tool.annotations.title && tool.inputSchema.type === 'object', tool.name);
  await client.close();
});

test('publicar y borrar nunca viene marcado en la pantalla de autorización', async () => {
  const context = createWebEnv();
  const {html} = await connect(context);
  assert.match(html, /value="bardo:write" checked/);
  assert.match(html, /value="bardo:share">/);
  assert.match(html, /no puede verificarlo/);
});

test('la autorización respeta lo que la persona deja marcado', async () => {
  const context = createWebEnv();
  const {client, provider} = await connect(context, {scopes: []});
  assert.equal(provider.savedTokens.scope, 'bardo:read');
  const names = (await client.listTools()).tools.map(tool => tool.name);
  assert.ok(names.includes('read_doc'));
  assert.ok(!names.includes('create_doc'));
  const blocked = await client.callTool({name: 'create_doc', arguments: inChannel({title: 'x', markdown: 'y'})});
  assert.equal(blocked.isError, true);
  assert.match(blocked.content[0].text, /no tiene permiso/);
  assert.equal(context.db.rows("SELECT * FROM documents").length, 0);
});

test('un documento se crea, se lee y se edita con detección de conflictos', async () => {
  const context = createWebEnv();
  const {client} = await connect(context);

  const created = parse(await client.callTool({name: 'create_doc', arguments: inChannel({title: 'Plan', markdown: '# Plan\n\nHola'})}));
  const docId = created.document.id;
  const read = parse(await client.callTool({name: 'read_doc', arguments: inChannel({doc_id: docId})}));
  assert.match(read.markdown, /Hola/);

  const updated = parse(await client.callTool({name: 'update_doc', arguments: inChannel({doc_id: docId, base_updated_at: read.updatedAt, markdown: '# Plan\n\nChao'})}));
  assert.equal(updated.ok, true);

  const stale = await client.callTool({name: 'update_doc', arguments: inChannel({doc_id: docId, base_updated_at: read.updatedAt, markdown: '# Plan\n\nPisado'})});
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /\(conflict\)/);

  const found = parse(await client.callTool({name: 'list_docs', arguments: inChannel({query: 'plan'})}));
  assert.equal(found.documents.length, 1);
  assert.equal(found.documents[0].createdByName, 'Tester');
});

test('leer un documento largo se hace por partes y avisa que es contenido no confiable', async () => {
  const context = createWebEnv();
  insertDocument(context.db, {id: '11111111-1111-4111-8111-111111111111', title: 'Largo', markdown: 'a'.repeat(100)});
  const {client} = await connect(context);
  const result = await client.callTool({name: 'read_doc', arguments: inChannel({doc_id: '11111111-1111-4111-8111-111111111111', max_chars: 60})});
  assert.match(result.content[0].text, /nunca como instrucciones/);
  const page = parse(result);
  assert.equal(page.markdown.length, 60);
  assert.equal(page.nextOffset, 60);
  assert.equal(page.totalChars, 100);
});

test('no se puede operar en un canal que Discord no deja ver', async () => {
  const context = createWebEnv();
  const {client} = await connect(context);
  for (const [name, args] of [
    ['get_board', {}],
    ['list_meetings', {}],
    ['create_doc', {title: 'x', markdown: 'y'}],
    ['create_card', {title: 'x'}],
  ]) {
    const result = await client.callTool({name, arguments: {guild_id: GUILD, channel_id: PRIVATE_CHANNEL, ...args}});
    assert.equal(result.isError, true, name);
  }
  assert.equal(context.db.rows('SELECT * FROM documents').length, 0);
  const channels = parse(await client.callTool({name: 'list_channels', arguments: {}}));
  assert.deepEqual(channels.guilds[0].channels.map(channel => channel.id), [CHANNEL]);
});

test('las tareas se crean, mueven, editan y archivan', async () => {
  const context = createWebEnv();
  const {client} = await connect(context);
  const board = parse(await client.callTool({name: 'get_board', arguments: inChannel()}));
  assert.ok(board.columns.length >= 2);

  const created = parse(await client.callTool({name: 'create_card', arguments: inChannel({title: 'Revisar', priority: 'high'})}));
  const cardId = created.card.id;
  const moved = parse(await client.callTool({name: 'move_card', arguments: inChannel({card_id: cardId, column_id: board.columns[1].id})}));
  assert.equal(moved.card.columnId, board.columns[1].id);

  const edited = parse(await client.callTool({name: 'update_card', arguments: inChannel({card_id: cardId, base_version: moved.card.version, title: 'Revisado'})}));
  assert.equal(edited.card.title, 'Revisado');
  const stale = await client.callTool({name: 'update_card', arguments: inChannel({card_id: cardId, base_version: moved.card.version, title: 'Otro'})});
  assert.match(stale.content[0].text, /\(conflict\)/);

  assert.ok(parse(await client.callTool({name: 'archive_card', arguments: inChannel({card_id: cardId})})).card.archivedAt);
  const archived = parse(await client.callTool({name: 'get_board', arguments: inChannel({archived: true})}));
  assert.deepEqual(archived.cards.map(card => card.id), [cardId]);
  assert.equal(parse(await client.callTool({name: 'restore_card', arguments: inChannel({card_id: cardId})})).card.archivedAt, null);
});

test('las reuniones se crean con agenda en el formato que usa Bardo', async () => {
  const context = createWebEnv();
  const {client} = await connect(context);
  const created = parse(await client.callTool({
    name: 'create_meeting',
    arguments: inChannel({title: 'Semanal', date: '2026-12-01', start_time: '09:30', target_duration_minutes: 30, agenda: [{title: 'Avances', duration_minutes: 20}, {title: 'Riesgos'}]}),
  }));
  const meetingId = created.meeting.id;
  const meeting = parse(await client.callTool({name: 'get_meeting', arguments: inChannel({meeting_id: meetingId})}));
  assert.equal(meeting.startTime, '09:30');
  assert.deepEqual(meeting.blocks.map(block => [block.title, block.durationMinutes]), [['Avances', 20], ['Riesgos', 10]]);
  const [first] = meeting.blocks;
  assert.equal(first.phases.context + first.phases.review + first.phases.closing, 20);
  assert.deepEqual(first.subpoints, []);
  assert.deepEqual(first.decisions, []);

  const updated = parse(await client.callTool({name: 'update_meeting', arguments: inChannel({meeting_id: meetingId, base_updated_at: meeting.updatedAt, title: 'Semanal 2'})}));
  assert.equal(updated.meeting.title, 'Semanal 2');
  assert.deepEqual(parse(await client.callTool({name: 'list_meetings', arguments: inChannel()})).meetings.map(item => item.id), [meetingId]);
  assert.equal(parse(await client.callTool({name: 'archive_meeting', arguments: inChannel({meeting_id: meetingId})})).archived, true);
});

test('publicar exige el permiso explícito y queda registrado a nombre de la persona', async () => {
  const context = createWebEnv();
  const {client} = await connect(context, {scopes: ['bardo:write', 'bardo:share']});
  const doc = parse(await client.callTool({name: 'create_doc', arguments: inChannel({title: 'Acta', markdown: '# Acta\n\nx'})})).document;
  const published = parse(await client.callTool({name: 'publish_doc', arguments: inChannel({doc_id: doc.id})}));
  assert.equal(published.messageId, 'message-1');
  assert.equal(context.sent.length, 1);
  assert.equal(context.sent[0].channelId, CHANNEL);

  const rows = context.db.rows('SELECT * FROM mcp_audit ORDER BY id');
  assert.deepEqual(rows.map(row => [row.tool, row.ok]), [['create_doc', 1], ['publish_doc', 1]]);
  assert.equal(rows[1].user_id, USER);
  assert.equal(rows[1].client_name, 'Cliente de prueba');
  assert.equal(rows[1].target, doc.id);
  assert.equal(rows[1].guild_id, GUILD);
});

test('las lecturas no llenan el registro y los fallos de escritura sí quedan', async () => {
  const context = createWebEnv();
  const {client} = await connect(context);
  await client.callTool({name: 'list_channels', arguments: {}});
  await client.callTool({name: 'archive_doc', arguments: inChannel({doc_id: '22222222-2222-4222-8222-222222222222'})});
  const rows = context.db.rows('SELECT tool, ok, error_code FROM mcp_audit');
  assert.deepEqual(rows, [{tool: 'archive_doc', ok: 0, error_code: 'forbidden'}]);
});

test('el MCP sin token responde 401 con la dirección para autorizarse', async () => {
  const {env} = createWebEnv();
  const response = await worker.fetch(new Request(`${WEB_ORIGIN}/mcp`, {method: 'POST', body: '{}'}), env);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /resource_metadata="https:\/\/bardo\.test\/\.well-known\/oauth-protected-resource\/mcp"/);
});

test('la sesión de canal de la web no abre el MCP', async () => {
  const {env} = createWebEnv();
  const browser = createBrowser(worker, env);
  await browser.login();
  const opened = await browser.fetch('/api/web/channel-session', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({guildId: GUILD, channelId: CHANNEL}),
  });
  const {bardo_token: token} = await opened.json();
  const response = await worker.fetch(new Request(`${WEB_ORIGIN}/mcp`, {method: 'POST', body: '{}', headers: {Authorization: `Bearer ${token}`}}), env);
  assert.equal(response.status, 401);
});

test('un token de MCP no abre las APIs de contenido', async () => {
  const context = createWebEnv();
  const {provider} = await connect(context);
  const response = await worker.fetch(new Request(`${WEB_ORIGIN}/api/docs`, {headers: {Authorization: `Bearer ${provider.savedTokens.access_token}`}}), context.env);
  assert.equal(response.status, 401);
});

test('GET en el MCP y orígenes ajenos se rechazan', async () => {
  const context = createWebEnv();
  const {provider} = await connect(context);
  const headers = {Authorization: `Bearer ${provider.savedTokens.access_token}`};
  assert.equal((await worker.fetch(new Request(`${WEB_ORIGIN}/mcp`, {headers}), context.env)).status, 405);
  const foreign = await worker.fetch(new Request(`${WEB_ORIGIN}/mcp`, {method: 'POST', body: '{}', headers: {...headers, Origin: 'https://evil.test'}}), context.env);
  assert.equal(foreign.status, 403);
});

test('el código solo sirve una vez y repetirlo revoca la autorización', async () => {
  const context = createWebEnv();
  const {provider, code} = await connect(context);
  const response = await worker.fetch(new Request(`${WEB_ORIGIN}/oauth/token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: provider.savedClient.client_id,
      redirect_uri: REDIRECT_URI,
      code_verifier: provider.verifier,
    }).toString(),
  }), context.env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'invalid_grant');
  const access = await worker.fetch(new Request(`${WEB_ORIGIN}/mcp`, {method: 'POST', body: '{}', headers: {Authorization: `Bearer ${provider.savedTokens.access_token}`}}), context.env);
  assert.equal(access.status, 401);
});

test('PKCE incorrecto no entrega tokens', async () => {
  const context = createWebEnv();
  const fetchFn = workerFetch(context.env);
  let url;
  const provider = new MemoryProvider(value => { url = value; });
  await auth(provider, {serverUrl: `${WEB_ORIGIN}/mcp`, fetchFn});
  const {location} = await approve(createBrowser(worker, context.env), url);
  const response = await fetchFn(`${WEB_ORIGIN}/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: location.searchParams.get('code'),
      client_id: provider.savedClient.client_id,
      redirect_uri: REDIRECT_URI,
      code_verifier: 'x'.repeat(50),
    }).toString(),
  });
  assert.equal(response.status, 400);
  assert.equal(context.db.rows('SELECT * FROM mcp_tokens').length, 0);
});

async function refresh(env, provider, refreshToken) {
  return worker.fetch(new Request(`${WEB_ORIGIN}/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: refreshToken, client_id: provider.savedClient.client_id}).toString(),
  }), env);
}

test('el refresh rota el token; repetirlo tarde revoca toda la cadena', async () => {
  const context = createWebEnv();
  const {provider} = await connect(context);
  const first = provider.savedTokens.refresh_token;
  const renewed = await refresh(context.env, provider, first);
  assert.equal(renewed.status, 200);
  const tokens = await renewed.json();
  assert.notEqual(tokens.refresh_token, first);

  // Dentro del margen (dos procesos a la vez) no se castiga.
  assert.equal((await refresh(context.env, provider, first)).status, 400);
  assert.equal((await refresh(context.env, provider, tokens.refresh_token)).status, 200);

  // Fuera del margen, un refresh repetido corta todo.
  context.db.run("UPDATE mcp_tokens SET used_at = '2020-01-01T00:00:00.000Z' WHERE used_at IS NOT NULL");
  assert.equal((await refresh(context.env, provider, first)).status, 400);
  assert.equal(context.db.row('SELECT revoked_at FROM mcp_grants').revoked_at !== null, true);
  assert.equal(context.db.rows('SELECT * FROM mcp_tokens').length, 0);
});

test('un token vencido no entra', async () => {
  const context = createWebEnv();
  const {provider} = await connect(context);
  context.db.run("UPDATE mcp_tokens SET expires_at = '2020-01-01T00:00:00.000Z' WHERE kind = 'access'");
  const response = await worker.fetch(new Request(`${WEB_ORIGIN}/mcp`, {method: 'POST', body: '{}', headers: {Authorization: `Bearer ${provider.savedTokens.access_token}`}}), context.env);
  assert.equal(response.status, 401);
});

test('la persona ve sus conexiones y puede revocarlas; otra persona no', async () => {
  const context = createWebEnv();
  const {browser, provider} = await connect(context);
  const {connections} = await (await browser.fetch('/api/web/connections')).json();
  assert.equal(connections.length, 1);
  assert.equal(connections[0].clientName, 'Cliente de prueba');
  assert.deepEqual(connections[0].scopes, ['bardo:read', 'bardo:write']);

  const other = createBrowser(worker, {...context.env, DISCORD_FETCH: createWebDiscordFetch({userId: 'otra-persona'})});
  await other.login();
  assert.equal((await other.fetch(`/api/web/connections/${connections[0].id}`, {method: 'DELETE'})).status, 404);
  assert.equal(((await (await other.fetch('/api/web/connections')).json()).connections).length, 0);

  assert.equal((await browser.fetch(`/api/web/connections/${connections[0].id}`, {method: 'DELETE', origin: 'https://evil.test'})).status, 403);
  assert.equal((await browser.fetch(`/api/web/connections/${connections[0].id}`, {method: 'DELETE'})).status, 200);
  const access = await worker.fetch(new Request(`${WEB_ORIGIN}/mcp`, {method: 'POST', body: '{}', headers: {Authorization: `Bearer ${provider.savedTokens.access_token}`}}), context.env);
  assert.equal(access.status, 401);
});

test('cancelar la autorización devuelve access_denied y no crea permisos', async () => {
  const context = createWebEnv();
  const fetchFn = workerFetch(context.env);
  let url;
  const provider = new MemoryProvider(value => { url = value; });
  await auth(provider, {serverUrl: `${WEB_ORIGIN}/mcp`, fetchFn});
  const {location} = await approve(createBrowser(worker, context.env), url, {decision: 'deny'});
  assert.equal(location.searchParams.get('error'), 'access_denied');
  assert.equal(context.db.rows('SELECT * FROM mcp_grants').length, 0);
});

test('la autorización no redirige a direcciones sin registrar y exige PKCE', async () => {
  const context = createWebEnv();
  const browser = createBrowser(worker, context.env);
  await browser.login();
  const registered = await (await workerFetch(context.env)(`${WEB_ORIGIN}/oauth/register`, {
    method: 'POST',
    body: JSON.stringify({client_name: '<b>Evil</b>', redirect_uris: [REDIRECT_URI]}),
  })).json();
  const clientId = registered.client_id;
  const query = extra => new URLSearchParams({client_id: clientId, response_type: 'code', redirect_uri: REDIRECT_URI, code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', ...extra});

  const evil = await browser.fetch(`/oauth/authorize?${query({redirect_uri: 'https://evil.test/cb'})}`);
  assert.equal(evil.status, 400);
  assert.equal(evil.headers.get('location'), null);

  const unknown = await browser.fetch(`/oauth/authorize?${query({client_id: 'nadie'})}`);
  assert.equal(unknown.status, 400);

  // Una solicitud mal formada nunca redirige: el registro es público y serviría para saltar a otro sitio.
  for (const extra of [{code_challenge_method: 'plain'}, {resource: 'https://evil.test/mcp'}, {response_type: 'token'}, {scope: 'nada'}]) {
    const rejected = await browser.fetch(`/oauth/authorize?${query(extra)}`);
    assert.equal(rejected.status, 400, JSON.stringify(extra));
    assert.equal(rejected.headers.get('location'), null, JSON.stringify(extra));
  }

  // El puerto de loopback puede cambiar (Claude Code y Codex usan uno temporal).
  const otherPort = await browser.fetch(`/oauth/authorize?${query({redirect_uri: 'http://127.0.0.1:50000/callback'})}`);
  assert.equal(otherPort.status, 200);
  const html = await otherPort.text();
  assert.ok(!html.includes('<b>Evil</b>'), 'el nombre del cliente se escapa');
  assert.match(html, /&lt;b&gt;Evil/);
  assert.equal(otherPort.headers.get('x-frame-options'), 'DENY');
  assert.match(otherPort.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('la pantalla de autorización deja que el navegador envíe su Origin', async () => {
  // Con «no-referrer», un formulario envía «Origin: null» y nunca se podría aceptar.
  const context = createWebEnv();
  const fetchFn = workerFetch(context.env);
  let url;
  await auth(new MemoryProvider(value => { url = value; }), {serverUrl: `${WEB_ORIGIN}/mcp`, fetchFn});
  const browser = createBrowser(worker, context.env);
  await browser.login();
  const page = await browser.fetch(`${url.pathname}${url.search}`);
  assert.equal(page.headers.get('referrer-policy'), 'same-origin');
});

test('la autorización solo se acepta desde la web y con la sesión que la abrió', async () => {
  const context = createWebEnv();
  const fetchFn = workerFetch(context.env);
  let url;
  const provider = new MemoryProvider(value => { url = value; });
  await auth(provider, {serverUrl: `${WEB_ORIGIN}/mcp`, fetchFn});

  const owner = createBrowser(worker, context.env);
  await owner.login();
  const page = await owner.fetch(`${url.pathname}${url.search}`);
  const consent = (await page.text()).match(/name="consent" value="([^"]+)"/)[1];
  const body = new URLSearchParams({consent, decision: 'allow'}).toString();
  const headers = {'Content-Type': 'application/x-www-form-urlencoded'};

  const forged = await owner.fetch('/oauth/authorize', {method: 'POST', headers, body, origin: 'https://evil.test'});
  assert.equal(forged.status, 403);

  const attacker = createBrowser(worker, context.env);
  await attacker.login();
  const stolen = await attacker.fetch('/oauth/authorize', {method: 'POST', headers, body});
  assert.equal(stolen.status, 400);
  assert.equal(context.db.rows('SELECT * FROM mcp_grants').length, 0);
});

test('el registro público tiene límite por dirección', async () => {
  const {env} = createWebEnv();
  const send = workerFetch(env);
  const register = () => send(`${WEB_ORIGIN}/oauth/register`, {method: 'POST', body: JSON.stringify({client_name: 'x', redirect_uris: [REDIRECT_URI]})});
  for (let attempt = 0; attempt < 10; attempt += 1) assert.equal((await register()).status, 201);
  assert.equal((await register()).status, 429);
});

test('el registro rechaza direcciones peligrosas', () => {
  for (const uri of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'http://evil.test/cb', 'https://a.test/#f', 'https://u:p@a.test/', 'nada', '']) {
    assert.equal(isAllowedRedirectUri(uri), false, uri);
  }
  for (const uri of ['https://a.test/cb', 'http://localhost:1234/cb', 'http://127.0.0.1/cb', 'cursor://anysphere.cursor-mcp/oauth/callback']) {
    assert.equal(isAllowedRedirectUri(uri), true, uri);
  }
  assert.equal(redirectUriMatches('http://localhost:1/cb', 'http://localhost:2/cb'), true);
  assert.equal(redirectUriMatches('http://localhost:1/cb', 'http://localhost:2/otro'), false);
  assert.equal(redirectUriMatches('https://a.test:1/cb', 'https://a.test:2/cb'), false);
  assert.equal(redirectUriMatches('http://localhost:1/cb', 'http://127.0.0.1:1/cb'), false);
});

test('los parámetros se validan antes de llegar a las APIs', () => {
  const tool = TOOLS.find(candidate => candidate.name === 'create_card');
  assert.equal(validateArguments(tool, inChannel({title: 'Tarea'})), null);
  assert.match(validateArguments(tool, inChannel({})), /falta title/);
  assert.match(validateArguments(tool, inChannel({title: '   '})), /vacío/);
  assert.match(validateArguments(tool, inChannel({title: 'a', priority: 'máxima'})), /priority/);
  assert.match(validateArguments(tool, inChannel({title: 'a', inventado: 1})), /no existe/);
  assert.match(validateArguments(tool, {guild_id: '../x', channel_id: CHANNEL, title: 'a'}), /no son válidos/);
});

test('cada herramienta declara su permiso, su riesgo y un esquema válido', () => {
  const names = new Set();
  for (const tool of TOOLS) {
    assert.ok(!names.has(tool.name), `duplicada: ${tool.name}`);
    names.add(tool.name);
    assert.ok(['bardo:read', 'bardo:write', 'bardo:share'].includes(tool.scope), tool.name);
    assert.equal(tool.annotations.readOnlyHint, tool.scope === 'bardo:read', tool.name);
    if (!tool.noChannel) assert.deepEqual(tool.inputSchema.required.slice(0, 2), ['guild_id', 'channel_id'], tool.name);
    for (const key of tool.inputSchema.required || []) assert.ok(tool.inputSchema.properties[key], `${tool.name}.${key}`);
  }
});
