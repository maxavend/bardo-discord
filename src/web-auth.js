// Bardo en el navegador: inicio de sesión solo con Discord. No hay cuentas
// propias ni se guarda el token de Discord: se usa una vez para saber quién
// es la persona. Todo queda apagado mientras WEB_ORIGIN no esté configurado.
import {DISCORD_CLIENT_ID, authFetch, hashToken} from './discord-auth.js';
import {isDiscordUnavailableError} from './discord-permissions.js';
import {
  consumeOauthState,
  deleteWebSession,
  loadWebSession,
  saveOauthState,
  saveWebSession,
} from './web-db.js';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/v10/users/@me';

const LOGIN_PATH = '/auth/discord';
const CALLBACK_PATH = '/auth/discord/callback';

export const WEB_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
// Cada intento escribe en D1 y nadie ha iniciado sesión todavía.
const LOGINS_PER_MINUTE = 30;

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const attemptLog = new Map();

/** Límite por isolate para rutas caras o públicas: no toca la base ni agrega infraestructura. */
export function overRateLimit(key, perMinute, now = Date.now()) {
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

export const clientAddress = request => request.headers.get('cf-connecting-ip') || 'local';

export function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function randomToken(byteLength = 32) {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** Origen público de la web y del MCP, o null si esta función está apagada. */
export function webOrigin(env) {
  const raw = String(env?.WEB_ORIGIN || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && !isLoopback(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** La web solo existe en su propio origen: la Activity y otros dominios no cambian. */
export function isWebRequest(url, env) {
  const origin = webOrigin(env);
  return Boolean(origin) && url.origin === origin;
}

/**
 * Marca el HTML servido en el dominio web. Sin esta marca el cliente ni siquiera
 * consulta la sesión, así que con la web apagada nada cambia fuera de Discord.
 * Se pide sin condiciones: un HTML en caché de antes de activar no traería la marca.
 */
export async function fetchWebAppHtml(request, env) {
  const response = await env.ASSETS.fetch(new Request(request.url, {method: 'GET'}));
  if (!(response.headers.get('content-type') || '').includes('text/html')) return response;
  const html = (await response.text()).replace(/<head(\s[^>]*)?>/i, match => `${match}<meta name="bardo-web" content="1">`);
  const marked = new Response(html, response);
  marked.headers.delete('content-length');
  marked.headers.delete('etag');
  return marked;
}

/** En localhost no hay HTTPS: ahí la cookie no lleva Secure ni el prefijo __Host-. */
function cookieSettings(env) {
  const secure = new URL(webOrigin(env)).protocol === 'https:';
  return {
    session: secure ? '__Host-bardo_web' : 'bardo_web',
    binding: secure ? '__Host-bardo_web_login' : 'bardo_web_login',
    attributes: `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
  };
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index !== -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim() || null;
  }
  return null;
}

function setCookie(name, value, maxAgeMs, attributes) {
  return `${name}=${value}; Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}; ${attributes}`;
}

/** Solo rutas internas: evita usar el login como redirección abierta. */
export function safeReturnTo(value) {
  const path = String(value || '');
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u001f]/.test(path)) return '/';
  try {
    const parsed = new URL(path, 'https://bardo.invalid');
    // También tras normalizar: «/.//sitio» termina siendo «//sitio».
    if (parsed.origin !== 'https://bardo.invalid' || parsed.pathname.startsWith('//')) return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

function redirect(location, cookies = []) {
  const headers = new Headers({...PRIVATE_HEADERS, Location: location});
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, {status: 302, headers});
}

export function webJson(data, status = 200, cookies = []) {
  const headers = new Headers({...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8'});
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(data), {status, headers});
}

export function webError(status, code, message, cookies = []) {
  return webJson({error: code, message}, status, cookies);
}

/** Lo que cambia datos desde el navegador debe venir de la propia web (anti-CSRF). */
export function isSameOriginMutation(request, env) {
  return request.headers.get('origin') === webOrigin(env);
}

/** Sesión vigente del navegador, o null. */
export async function readWebSession(request, env) {
  if (!env?.DB || !webOrigin(env)) return null;
  const token = readCookie(request, cookieSettings(env).session);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const session = await loadWebSession(env.DB, tokenHash);
  if (!session || !(Date.parse(session.expiresAt) > Date.now())) return null;
  return session;
}

async function startLogin(request, url, env) {
  if (!env.DISCORD_CLIENT_SECRET) return redirect('/?auth_error=not_configured');
  if (overRateLimit(`login:${clientAddress(request)}`, LOGINS_PER_MINUTE)) return redirect('/?auth_error=too_many');
  const state = randomToken();
  const binding = randomToken();
  const codeVerifier = randomToken(48);
  await saveOauthState(env.DB, await hashToken(state), {
    bindingHash: await hashToken(binding),
    codeVerifier,
    returnTo: safeReturnTo(url.searchParams.get('return_to')),
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
  });

  const authorize = new URL(DISCORD_AUTHORIZE_URL);
  authorize.search = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${webOrigin(env)}${CALLBACK_PATH}`,
    scope: 'identify',
    state,
    code_challenge: await pkceChallenge(codeVerifier),
    code_challenge_method: 'S256',
  }).toString();

  const {binding: bindingName, attributes} = cookieSettings(env);
  return redirect(authorize.toString(), [setCookie(bindingName, binding, OAUTH_STATE_TTL_MS, attributes)]);
}

async function discordIdentity(code, codeVerifier, env) {
  const tokenResponse = await authFetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${webOrigin(env)}${CALLBACK_PATH}`,
      code_verifier: codeVerifier,
    }),
  }, env);
  const token = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !token?.access_token) throw new Error(`Discord OAuth ${tokenResponse.status}`);

  const meResponse = await authFetch(DISCORD_ME_URL, {
    headers: {Authorization: `Bearer ${token.access_token}`},
  }, env);
  const me = await meResponse.json().catch(() => null);
  if (!meResponse.ok || !me?.id) throw new Error(`Discord identity ${meResponse.status}`);
  return me;
}

async function finishLogin(request, url, env) {
  const {session: sessionName, binding: bindingName, attributes} = cookieSettings(env);
  const clearBinding = setCookie(bindingName, '', 0, attributes);
  const fail = code => redirect(`/?auth_error=${code}`, [clearBinding]);

  const state = url.searchParams.get('state');
  const binding = readCookie(request, bindingName);
  if (!state || !binding) return fail('expired');
  const record = await consumeOauthState(env.DB, await hashToken(state));
  if (!record || !(Date.parse(record.expiresAt) > Date.now())) return fail('expired');
  // El state debe volver al mismo navegador que empezó (anti login-CSRF).
  if (record.bindingHash !== await hashToken(binding)) return fail('expired');

  if (url.searchParams.get('error')) return fail('cancelled');
  const code = url.searchParams.get('code');
  if (!code) return fail('cancelled');

  let me;
  try {
    me = await discordIdentity(code, record.codeVerifier, env);
  } catch (error) {
    console.error('Bardo web: Discord login failed', error?.message || error);
    return fail(isDiscordUnavailableError(error) ? 'discord_unavailable' : 'failed');
  }

  const token = randomToken();
  const now = Date.now();
  await saveWebSession(env.DB, await hashToken(token), {
    userId: String(me.id),
    username: me.global_name || me.username || null,
    avatar: me.avatar || null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + WEB_SESSION_TTL_MS).toISOString(),
  });
  return redirect(record.returnTo, [clearBinding, setCookie(sessionName, token, WEB_SESSION_TTL_MS, attributes)]);
}

export async function logoutWebSession(request, env) {
  const {session: sessionName, attributes} = cookieSettings(env);
  const token = readCookie(request, sessionName);
  if (token) await deleteWebSession(env.DB, await hashToken(token));
  return setCookie(sessionName, '', 0, attributes);
}

/** Inicio de sesión. Devuelve null si la ruta no es suya o la web está apagada. */
export async function handleWebAuth(request, url, env) {
  if (url.pathname !== LOGIN_PATH && url.pathname !== CALLBACK_PATH) return null;
  if (!isWebRequest(url, env) || !env.DB) return new Response('Not found', {status: 404});
  if (request.method !== 'GET') return new Response('Method not allowed', {status: 405});
  return url.pathname === LOGIN_PATH ? startLogin(request, url, env) : finishLogin(request, url, env);
}
