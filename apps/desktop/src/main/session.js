// Sesión de la app. El refresh token vive cifrado en disco y solo en el proceso
// main; el token de acceso, en memoria. La página web nunca recibe ninguno de
// los dos: solo los tokens por canal, que abren un único canal y caducan en un día.
import {EventEmitter} from 'node:events';
import {APP_SCOPES, CLIENT_ID, ORIGIN} from './config.js';
import {startLoopbackAuthorization, SignInError} from './oauth.js';
import {readSecret, removeFile, writeSecret} from './store.js';

const SESSION_FILE = 'session.bin';
// Renueva el acceso un poco antes de que caduque.
const ACCESS_MARGIN_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 20 * 1000;
const APP_API_PATHS = new Set(['me', 'channels', 'channel-content', 'channel-session']);

export class OfflineError extends Error {
  constructor() {
    super('No pudimos conectar con Bardo. Revisa tu conexión e inténtalo de nuevo.');
    this.code = 'offline';
  }
}

async function request(path, init = {}) {
  try {
    return await fetch(`${ORIGIN}${path}`, {...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
  } catch {
    throw new OfflineError();
  }
}

const formBody = values => ({
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'},
  body: new URLSearchParams(values).toString(),
});

export class SessionManager extends EventEmitter {
  constructor({openBrowser}) {
    super();
    this.openBrowser = openBrowser;
    this.refreshToken = null;
    this.user = null;
    this.persisted = false;
    this.accessToken = null;
    this.accessExpiresAt = 0;
    this.refreshing = null;
    this.pendingSignIn = null;
  }

  get signedIn() {
    return Boolean(this.refreshToken);
  }

  async load() {
    const saved = await readSecret(SESSION_FILE);
    if (saved?.refreshToken) {
      this.refreshToken = saved.refreshToken;
      this.user = saved.user || null;
      this.persisted = true;
    }
    return this.user;
  }

  async persist() {
    this.persisted = await writeSecret(SESSION_FILE, {refreshToken: this.refreshToken, user: this.user});
  }

  /** Abre el navegador y espera a que la persona confirme. Solo un intento a la vez. */
  async signIn() {
    if (this.pendingSignIn) {
      this.pendingSignIn.reopen();
      return this.pendingSignIn.result;
    }
    const flow = startLoopbackAuthorization({origin: ORIGIN, clientId: CLIENT_ID, scope: APP_SCOPES, openBrowser: this.openBrowser});
    this.pendingSignIn = {
      ...flow,
      result: (async () => {
        const {code, redirectUri, verifier} = await flow.promise;
        this.emit('authorized');
        const response = await request('/oauth/token', formBody({
          grant_type: 'authorization_code',
          code,
          client_id: CLIENT_ID,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }));
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.refresh_token) {
          throw new SignInError('token_failed', payload?.error_description || 'No pudimos completar el inicio de sesión. Vuelve a intentarlo.');
        }
        this.acceptTokens(payload);
        const me = await this.api('me');
        this.user = me.body?.user || null;
        await this.persist();
        this.emit('changed', this.user);
        return this.user;
      })().finally(() => { this.pendingSignIn = null; }),
    };
    return this.pendingSignIn.result;
  }

  cancelSignIn() {
    this.pendingSignIn?.cancel();
  }

  reopenSignIn() {
    this.pendingSignIn?.reopen();
  }

  acceptTokens(payload) {
    this.refreshToken = payload.refresh_token;
    this.accessToken = payload.access_token;
    this.accessExpiresAt = Date.now() + Math.max(0, Number(payload.expires_in || 0) * 1000 - ACCESS_MARGIN_MS);
  }

  async getAccessToken({force = false} = {}) {
    if (!this.refreshToken) return null;
    if (!force && this.accessToken && Date.now() < this.accessExpiresAt) return this.accessToken;
    // Una sola renovación a la vez: el servidor rota el refresh y detecta repeticiones.
    this.refreshing ||= (async () => {
      const response = await request('/oauth/token', formBody({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: CLIENT_ID,
      }));
      const payload = await response.json().catch(() => null);
      if (response.status === 400 || response.status === 401) {
        await this.clear('expired');
        return null;
      }
      if (!response.ok || !payload?.access_token) throw new OfflineError();
      this.acceptTokens(payload);
      await this.persist();
      return this.accessToken;
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  /** Llama a /api/app/<ruta> como la persona. Devuelve {status, body}. */
  async api(path, {method = 'GET', query = null, body = undefined} = {}) {
    if (!APP_API_PATHS.has(path)) return {status: 404, body: {error: 'not_found', message: 'Esta dirección no existe.'}};
    const url = new URL(`/api/app/${path}`, ORIGIN);
    if (query?.guild_id) url.searchParams.set('guild_id', String(query.guild_id));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.getAccessToken({force: attempt > 0});
      if (!token) return {status: 401, body: {error: 'auth_required', message: 'Tu sesión terminó. Vuelve a iniciar sesión con Discord.'}};
      const response = await request(`${url.pathname}${url.search}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
        },
        ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
      });
      if (response.status === 401 && attempt === 0) continue;
      const payload = await response.json().catch(() => null);
      if (response.status === 401) await this.clear('expired');
      return {status: response.status, body: payload};
    }
    return {status: 401, body: null};
  }

  async version() {
    try {
      const response = await request('/api/app/version', {headers: {Accept: 'application/json'}});
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  /** Cierra la sesión en este equipo y la revoca en el servidor (con sus tokens de canal). */
  async signOut() {
    const token = this.refreshToken;
    await this.clear('signed_out');
    if (token) {
      try {
        await request('/oauth/revoke', formBody({token, client_id: CLIENT_ID}));
      } catch {
        // Sin conexión: el token ya no existe en este equipo y caduca solo.
      }
    }
  }

  async clear(reason) {
    const had = Boolean(this.refreshToken);
    this.refreshToken = null;
    this.accessToken = null;
    this.accessExpiresAt = 0;
    this.user = null;
    this.persisted = false;
    await removeFile(SESSION_FILE);
    if (had) this.emit('signed-out', reason);
  }
}
