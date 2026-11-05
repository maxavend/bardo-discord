// Autorización del servidor MCP (OAuth 2.1 con PKCE y registro dinámico). Bardo
// es el servidor de autorización para los clientes de IA y Discord sigue siendo
// la única identidad: quien autoriza inicia sesión en la web y decide aquí qué
// puede hacer cada cliente. Los tokens se guardan como hash y se pueden revocar.
import {hashToken} from './discord-auth.js';
import {isSameOriginMutation, isWebRequest, pkceChallenge, randomToken, readWebSession, webOrigin} from './web-auth.js';
import {
  consumeMcpAuthCode,
  consumeMcpConsent,
  consumeMcpRefreshToken,
  loadMcpAccess,
  loadMcpClient,
  loadMcpGrant,
  revokeMcpGrant,
  saveMcpClient,
  saveMcpConsent,
  saveMcpGrantWithCode,
  saveMcpTokens,
  touchMcpGrant,
} from './web-db.js';

export const SCOPE_READ = 'bardo:read';
export const SCOPE_WRITE = 'bardo:write';
export const SCOPE_SHARE = 'bardo:share';
export const ALL_SCOPES = [SCOPE_READ, SCOPE_WRITE, SCOPE_SHARE];

const SCOPE_COPY = {
  [SCOPE_READ]: {
    title: 'Leer',
    detail: 'Canales, documentos, reuniones y tareas que tú puedes ver en Discord. Siempre incluido.',
  },
  [SCOPE_WRITE]: {
    title: 'Crear y editar',
    detail: 'Documentos, reuniones y tareas, y archivarlos. Asignar una tarea puede avisar a esa persona.',
  },
  [SCOPE_SHARE]: {
    title: 'Publicar y borrar',
    detail: 'Publicar en canales, enviar mensajes directos, abrir enlaces a tus documentos y eliminar para siempre. Actúa con tu nombre: actívalo solo si confías en este cliente.',
  },
};

export const MCP_PATH = '/mcp';
const METADATA_RESOURCE_PATH = '/.well-known/oauth-protected-resource';
const METADATA_AUTH_PATH = '/.well-known/oauth-authorization-server';
const AUTHORIZE_PATH = '/oauth/authorize';
const TOKEN_PATH = '/oauth/token';
const REGISTER_PATH = '/oauth/register';

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Pasado este plazo hay que volver a autorizar con Discord.
const GRANT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const CONSENT_TTL_MS = 10 * 60 * 1000;
// Dos procesos del mismo cliente pueden refrescar a la vez: no es un robo.
const REFRESH_REUSE_GRACE_MS = 60 * 1000;

const MAX_REDIRECT_URIS = 5;
const MAX_REDIRECT_URI_LENGTH = 512;
const MAX_CLIENT_NAME_LENGTH = 80;
const MAX_STATE_LENGTH = 2048;
const MAX_REGISTER_BYTES = 8 * 1024;
const MAX_TOKEN_BODY_BYTES = 8 * 1024;
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

// Esquemas que nunca pueden recibir un código: ejecutan algo o no llevan a una app.
const FORBIDDEN_REDIRECT_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:', 'ftp:', 'ws:', 'wss:']);

const REGISTER_LIMIT_PER_MINUTE = 10;
const TOKEN_LIMIT_PER_MINUTE = 60;
const attemptLog = new Map();

/** Límite por isolate: frena abusos de endpoints públicos sin tocar la base. */
function overLimit(request, bucket, perMinute, now = Date.now()) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const key = `${bucket}:${ip}`;
  const recent = (attemptLog.get(key) || []).filter(at => now - at < 60_000);
  if (recent.length >= perMinute) {
    attemptLog.set(key, recent);
    return true;
  }
  recent.push(now);
  attemptLog.set(key, recent);
  if (attemptLog.size > 5_000) attemptLog.delete(attemptLog.keys().next().value);
  return false;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

function publicJson(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

const oauthError = (error, description, status = 400) => publicJson({error, error_description: description}, status);

export function resourceUrl(env) {
  return `${webOrigin(env)}${MCP_PATH}`;
}

export function resourceMetadataUrl(env) {
  return `${webOrigin(env)}${METADATA_RESOURCE_PATH}${MCP_PATH}`;
}

function resourceMetadata(env) {
  return {
    resource: resourceUrl(env),
    resource_name: 'Bardo',
    authorization_servers: [webOrigin(env)],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ['header'],
  };
}

function authorizationMetadata(env) {
  const origin = webOrigin(env);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${AUTHORIZE_PATH}`,
    token_endpoint: `${origin}${TOKEN_PATH}`,
    registration_endpoint: `${origin}${REGISTER_PATH}`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ALL_SCOPES,
  };
}

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** https, http solo en loopback, o el esquema propio de una app de escritorio. */
export function isAllowedRedirectUri(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_REDIRECT_URI_LENGTH) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return isLoopbackHost(url.hostname);
  return !FORBIDDEN_REDIRECT_SCHEMES.has(url.protocol);
}

/** Coincidencia exacta; en loopback el puerto puede variar (RFC 8252 §7.3). */
export function redirectUriMatches(registered, requested) {
  if (registered === requested) return true;
  try {
    const a = new URL(registered);
    const b = new URL(requested);
    return a.protocol === 'http:' && b.protocol === 'http:'
      && isLoopbackHost(a.hostname) && a.hostname === b.hostname
      && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

async function handleRegister(request, env) {
  if (request.method !== 'POST') return oauthError('invalid_request', 'Usa POST.', 405);
  if (overLimit(request, 'register', REGISTER_LIMIT_PER_MINUTE)) {
    return oauthError('temporarily_unavailable', 'Demasiados registros seguidos. Espera un minuto.', 429);
  }
  const text = await request.text().catch(() => '');
  if (new TextEncoder().encode(text).byteLength > MAX_REGISTER_BYTES) {
    return oauthError('invalid_client_metadata', 'La solicitud es demasiado grande.', 413);
  }
  let metadata;
  try {
    metadata = JSON.parse(text);
  } catch {
    return oauthError('invalid_client_metadata', 'El cuerpo debe ser JSON.');
  }
  const redirectUris = metadata?.redirect_uris;
  if (!Array.isArray(redirectUris) || !redirectUris.length || redirectUris.length > MAX_REDIRECT_URIS
    || !redirectUris.every(isAllowedRedirectUri)) {
    return oauthError('invalid_redirect_uri', 'Las direcciones de retorno deben ser https, http en loopback o el esquema propio de una app.');
  }
  // Solo clientes públicos: la prueba de posesión es PKCE, no un secreto.
  if (metadata.token_endpoint_auth_method && metadata.token_endpoint_auth_method !== 'none') {
    return oauthError('invalid_client_metadata', 'Solo se admiten clientes públicos (token_endpoint_auth_method: none).');
  }

  const clientName = String(metadata.client_name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CLIENT_NAME_LENGTH) || 'Cliente sin nombre';
  const client = {
    clientId: `bardo_client_${randomToken(18)}`,
    clientName,
    redirectUris,
    createdAt: new Date().toISOString(),
  };
  await saveMcpClient(env.DB, client);
  return publicJson({
    client_id: client.clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000),
  }, 201);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
}

// Mismos colores de Bardo. Sin scripts ni recursos externos, salvo el avatar.
const PAGE_STYLE = `:root{color-scheme:dark;--bg:#16171b;--surface:#1f2026;--border:#33353d;--text:#f2f2f4;--muted:#a9abb4;--accent:#7c6cf0;--on-accent:#fff}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f6f6f8;--surface:#fff;--border:#dcdde2;--text:#1f2328;--muted:#5d6068;--accent:#5b4bd6}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:30rem;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px}
h1{font-size:1.25rem;line-height:1.3;margin:0 0 8px}p{margin:0 0 12px}.muted{color:var(--muted);font-size:.875rem}
fieldset{border:0;margin:16px 0;padding:0;display:grid;gap:8px}legend{font-weight:600;padding:0;margin-bottom:8px}
label{display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid var(--border);border-radius:12px}label>span{display:grid;gap:2px}
label strong{font-weight:600}input[type=checkbox]{width:20px;height:20px;margin:2px 0 0;flex:none;accent-color:var(--accent)}
.actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}
button{font:inherit;font-weight:600;min-height:44px;padding:8px 16px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer}
button[value=allow]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}code{overflow-wrap:anywhere}`;

function htmlPage(title, body, status = 200) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Bardo</title><style>${PAGE_STYLE}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      // Sin form-action: Chrome lo aplica también a la redirección hacia el cliente.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

const errorPage = (title, message, status = 400) => htmlPage(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`, status);

function redirectToClient(redirectUri, params, status = 302) {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) target.searchParams.set(key, value);
  }
  return new Response(null, {status, headers: {Location: target.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}});
}

function requestedScopes(raw) {
  if (raw === null || raw === undefined || !String(raw).trim()) return ALL_SCOPES;
  const requested = String(raw).trim().split(/\s+/);
  return ALL_SCOPES.filter(scope => requested.includes(scope));
}

function destinationLabel(redirectUri) {
  const url = new URL(redirectUri);
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return isLoopbackHost(url.hostname) ? 'una app en este equipo' : url.hostname;
  }
  return `la app «${url.protocol.slice(0, -1)}»`;
}

function consentPage(client, session, consentId, scopes, redirectUri) {
  const options = scopes.map(scope => {
    const copy = SCOPE_COPY[scope];
    if (scope === SCOPE_READ) {
      return `<label><input type="checkbox" checked disabled><span><strong>${escapeHtml(copy.title)}</strong><span class="muted">${escapeHtml(copy.detail)}</span></span></label>`;
    }
    // Publicar y borrar nunca viene marcado: requiere una decisión explícita.
    const checked = scope === SCOPE_WRITE ? ' checked' : '';
    return `<label><input type="checkbox" name="scope" value="${escapeHtml(scope)}"${checked}><span><strong>${escapeHtml(copy.title)}</strong><span class="muted">${escapeHtml(copy.detail)}</span></span></label>`;
  }).join('');

  return htmlPage('Autorizar conexión', `
    <h1>¿Conectar ${escapeHtml(client.clientName)} con Bardo?</h1>
    <p class="muted">Ese nombre lo declara la propia app y Bardo no puede verificarlo. Al aceptar, la autorización se entrega a ${escapeHtml(destinationLabel(redirectUri))}.</p>
    <p>Actuará como <strong>${escapeHtml(session.username || 'tu usuario de Discord')}</strong>, solo donde tengas acceso en Discord.</p>
    <form method="post" action="${AUTHORIZE_PATH}">
      <input type="hidden" name="consent" value="${escapeHtml(consentId)}">
      <fieldset><legend>Permisos</legend>${options}</fieldset>
      <p class="muted">Puedes revocarla cuando quieras desde tu menú de usuario en Bardo.</p>
      <div class="actions">
        <button type="submit" name="decision" value="deny">Cancelar</button>
        <button type="submit" name="decision" value="allow">Autorizar</button>
      </div>
    </form>`);
}

async function showConsent(request, url, env) {
  const params = url.searchParams;
  const clientId = params.get('client_id') || '';
  const redirectUri = params.get('redirect_uri') || '';
  const client = clientId ? await loadMcpClient(env.DB, clientId) : null;
  // Sin cliente o dirección válidos no se redirige: podría ser un phishing.
  if (!client) return errorPage('Cliente desconocido', 'Esta app no está registrada en Bardo. Vuelve a conectarla desde tu herramienta.');
  if (!isAllowedRedirectUri(redirectUri) || !client.redirectUris.some(registered => redirectUriMatches(registered, redirectUri))) {
    return errorPage('Dirección de retorno no válida', 'La app pidió volver a una dirección que no tiene registrada.');
  }

  const state = params.get('state');
  const fail = (error, description) => redirectToClient(redirectUri, {error, error_description: description, state, iss: webOrigin(env)});
  if (params.get('response_type') !== 'code') return fail('unsupported_response_type', 'Solo se admite response_type=code.');
  const codeChallenge = params.get('code_challenge') || '';
  if (params.get('code_challenge_method') !== 'S256' || !CODE_CHALLENGE_PATTERN.test(codeChallenge)) {
    return fail('invalid_request', 'PKCE con S256 es obligatorio.');
  }
  if (state && state.length > MAX_STATE_LENGTH) return fail('invalid_request', 'El parámetro state es demasiado largo.');
  const resource = params.get('resource');
  if (resource && resource !== resourceUrl(env)) return fail('invalid_target', 'Este servidor solo autoriza su propio MCP.');
  const scopes = requestedScopes(params.get('scope'));
  if (!scopes.length) return fail('invalid_scope', 'Ninguno de los permisos pedidos existe.');
  if (!scopes.includes(SCOPE_READ)) scopes.unshift(SCOPE_READ);

  const session = await readWebSession(request, env);
  if (!session) {
    const returnTo = encodeURIComponent(`${url.pathname}${url.search}`);
    return new Response(null, {status: 302, headers: {Location: `/auth/discord?return_to=${returnTo}`, 'Cache-Control': 'no-store'}});
  }

  const consentId = randomToken();
  await saveMcpConsent(env.DB, await hashToken(consentId), {
    sessionHash: session.tokenHash,
    clientId: client.clientId,
    redirectUri,
    state,
    codeChallenge,
    scope: scopes.join(' '),
    expiresAt: new Date(Date.now() + CONSENT_TTL_MS).toISOString(),
  });
  return consentPage(client, session, consentId, scopes, redirectUri);
}

async function submitConsent(request, env) {
  if (!isSameOriginMutation(request, env)) return errorPage('Solicitud no válida', 'Esta autorización no se envió desde Bardo.', 403);
  const session = await readWebSession(request, env);
  if (!session) return errorPage('Tu sesión expiró', 'Vuelve a conectar la app desde tu herramienta.', 401);

  const form = await request.formData().catch(() => null);
  const consentId = form?.get('consent');
  const consent = typeof consentId === 'string' && consentId ? await consumeMcpConsent(env.DB, await hashToken(consentId)) : null;
  if (!consent || !(Date.parse(consent.expiresAt) > Date.now()) || consent.sessionHash !== session.tokenHash) {
    return errorPage('Esta autorización expiró', 'Vuelve a conectar la app desde tu herramienta.');
  }

  const issuer = webOrigin(env);
  if (form.get('decision') !== 'allow') {
    return redirectToClient(consent.redirectUri, {error: 'access_denied', state: consent.state, iss: issuer}, 303);
  }

  // Solo lo que el cliente pidió y la persona dejó marcado. Leer es la base.
  const offered = consent.scope.split(' ');
  const chosen = form.getAll('scope').map(String);
  const granted = offered.filter(scope => scope === SCOPE_READ || chosen.includes(scope));

  const now = Date.now();
  const code = `bardo_code_${randomToken()}`;
  await saveMcpGrantWithCode(env.DB, {
    id: crypto.randomUUID(),
    clientId: consent.clientId,
    userId: session.userId,
    username: session.username,
    avatar: session.avatar,
    scope: granted.join(' '),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + GRANT_TTL_MS).toISOString(),
  }, {
    codeHash: await hashToken(code),
    redirectUri: consent.redirectUri,
    codeChallenge: consent.codeChallenge,
    expiresAt: new Date(now + AUTH_CODE_TTL_MS).toISOString(),
  });
  return redirectToClient(consent.redirectUri, {code, state: consent.state, iss: issuer}, 303);
}

async function issueTokens(env, grant) {
  const now = Date.now();
  const accessToken = `bardo_at_${randomToken()}`;
  const refreshToken = `bardo_rt_${randomToken()}`;
  const grantExpiry = Date.parse(grant.expiresAt);
  await saveMcpTokens(env.DB, grant.id, [
    {tokenHash: await hashToken(accessToken), kind: 'access', expiresAt: new Date(Math.min(now + ACCESS_TOKEN_TTL_MS, grantExpiry)).toISOString()},
    {tokenHash: await hashToken(refreshToken), kind: 'refresh', expiresAt: new Date(Math.min(now + REFRESH_TOKEN_TTL_MS, grantExpiry)).toISOString()},
  ], new Date(now).toISOString());
  return publicJson({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(Math.min(ACCESS_TOKEN_TTL_MS, grantExpiry - now) / 1000),
    refresh_token: refreshToken,
    scope: grant.scope,
  });
}

const invalidGrant = description => oauthError('invalid_grant', description);

async function exchangeCode(params, env) {
  const code = params.get('code') || '';
  const verifier = params.get('code_verifier') || '';
  const clientId = params.get('client_id') || '';
  const redirectUri = params.get('redirect_uri') || '';
  if (!code || !clientId || !redirectUri || !CODE_VERIFIER_PATTERN.test(verifier)) {
    return oauthError('invalid_request', 'Faltan code, client_id, redirect_uri o code_verifier.');
  }
  const resource = params.get('resource');
  if (resource && resource !== resourceUrl(env)) return oauthError('invalid_target', 'Este servidor solo emite tokens para su propio MCP.');

  const nowIso = new Date().toISOString();
  const record = await consumeMcpAuthCode(env.DB, await hashToken(code), nowIso);
  if (!record) return invalidGrant('El código no es válido.');
  if (record.alreadyUsed) {
    // Un código repetido puede ser un robo: se revoca lo emitido con él.
    await revokeMcpGrant(env.DB, record.grantId, nowIso);
    return invalidGrant('Este código ya se usó.');
  }
  if (record.clientId !== clientId || record.redirectUri !== redirectUri) return invalidGrant('El código no corresponde a este cliente.');
  if (!(Date.parse(record.expiresAt) > Date.now())) return invalidGrant('El código expiró.');
  if (await pkceChallenge(verifier) !== record.codeChallenge) return invalidGrant('La verificación PKCE falló.');

  const grant = await loadMcpGrant(env.DB, record.grantId);
  if (!grant || grant.revokedAt || grant.clientId !== clientId) return invalidGrant('Esta autorización fue revocada.');
  return issueTokens(env, grant);
}

async function exchangeRefreshToken(params, env) {
  const refreshToken = params.get('refresh_token') || '';
  const clientId = params.get('client_id') || '';
  if (!refreshToken || !clientId) return oauthError('invalid_request', 'Faltan refresh_token o client_id.');

  const nowIso = new Date().toISOString();
  const record = await consumeMcpRefreshToken(env.DB, await hashToken(refreshToken), nowIso);
  if (!record) return invalidGrant('El token no es válido o expiró.');

  const grant = await loadMcpGrant(env.DB, record.grantId);
  if (!grant || grant.clientId !== clientId) return invalidGrant('El token no corresponde a este cliente.');
  if (record.alreadyUsed) {
    // Repetido fuera del margen: el token pudo filtrarse. Se corta toda la cadena.
    if (Date.now() - Date.parse(record.usedAt) > REFRESH_REUSE_GRACE_MS) await revokeMcpGrant(env.DB, grant.id, nowIso);
    return invalidGrant('Este token ya se usó.');
  }
  if (grant.revokedAt || !(Date.parse(grant.expiresAt) > Date.now())) return invalidGrant('Esta autorización terminó. Vuelve a conectar la app.');
  return issueTokens(env, grant);
}

async function handleToken(request, env) {
  if (request.method !== 'POST') return oauthError('invalid_request', 'Usa POST.', 405);
  if (overLimit(request, 'token', TOKEN_LIMIT_PER_MINUTE)) {
    return oauthError('temporarily_unavailable', 'Demasiados intentos seguidos. Espera un minuto.', 429);
  }
  const text = await request.text().catch(() => '');
  if (new TextEncoder().encode(text).byteLength > MAX_TOKEN_BODY_BYTES) return oauthError('invalid_request', 'La solicitud es demasiado grande.', 413);
  const params = new URLSearchParams(text);
  const grantType = params.get('grant_type');
  if (grantType === 'authorization_code') return exchangeCode(params, env);
  if (grantType === 'refresh_token') return exchangeRefreshToken(params, env);
  return oauthError('unsupported_grant_type', 'Usa authorization_code o refresh_token.');
}

/** Permiso del token de una petición al MCP, o null. */
export async function authenticateMcpRequest(request, env) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const now = new Date();
  const grant = await loadMcpAccess(env.DB, await hashToken(match[1]), now.toISOString());
  if (!grant) return null;
  // Basta con saber el último uso aproximado: no se escribe en cada llamada.
  if (!grant.lastUsedAt || now.getTime() - Date.parse(grant.lastUsedAt) > 5 * 60 * 1000) {
    await touchMcpGrant(env.DB, grant.id, now.toISOString());
  }
  return grant;
}

/** Rutas de autorización. Devuelve null si no es suya; 404 con la web apagada. */
export async function handleMcpOAuth(request, url, env) {
  const {pathname} = url;
  const isMetadata = pathname === METADATA_AUTH_PATH
    || pathname === METADATA_RESOURCE_PATH
    || pathname === `${METADATA_RESOURCE_PATH}${MCP_PATH}`;
  const isEndpoint = pathname === AUTHORIZE_PATH || pathname === TOKEN_PATH || pathname === REGISTER_PATH;
  if (!isMetadata && !isEndpoint) return null;
  if (!isWebRequest(url, env) || !env.DB) return new Response('Not found', {status: 404});

  if (request.method === 'OPTIONS' && pathname !== AUTHORIZE_PATH) {
    return new Response(null, {status: 204, headers: CORS_HEADERS});
  }
  if (pathname === METADATA_AUTH_PATH) return publicJson(authorizationMetadata(env));
  if (isMetadata) return publicJson(resourceMetadata(env));
  if (pathname === REGISTER_PATH) return handleRegister(request, env);
  if (pathname === TOKEN_PATH) return handleToken(request, env);
  if (request.method === 'GET') return showConsent(request, url, env);
  if (request.method === 'POST') return submitConsent(request, env);
  return new Response('Method not allowed', {status: 405});
}
