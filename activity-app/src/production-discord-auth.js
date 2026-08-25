import {installBardoApiSession} from './production-launch-auth.js';

const FALLBACK_CLIENT_ID = '1539704001535156254';
const AUTH_TIMEOUT_MS = 15000;
const SDK_READY_TIMEOUT_MS = 10000;
const SESSION_CACHE_KEY = 'bardo_sessions_v2';
const LEGACY_SESSION_CACHE_KEY = 'bardo_session_v1';
const MAX_SESSION_CACHE_ENTRIES = 12;

export function logBreadcrumb(stage, detail = null) {
  try {
    const timestamp = new Date().toISOString();
    const payload = detail ? ` - ${JSON.stringify(detail)}` : '';
    console.log(`[Bardo Activity | ${timestamp}] ${stage}${payload}`);
    window.__BARDO_LAST_BREADCRUMB__ = stage;
  } catch {}
}

export function resolveClientId() {
  const host = window.location.hostname || '';
  const match = host.match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i);
  return match?.[1] || FALLBACK_CLIENT_ID;
}

export function launchCustomId(sdk) {
  const params = new URLSearchParams(window.location.search);
  return sdk?.customId
    || params.get('custom_id')
    || params.get('document')
    || params.get('id')
    || null;
}

export function isEmbeddedActivity() {
  const params = new URLSearchParams(window.location.search);
  return params.has('instance_id')
    || params.has('frame_id')
    || /\.discordsays\.com$/i.test(window.location.hostname || '');
}

function withTimeout(promise, ms, label) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Tiempo de espera agotado: ${label} (${ms}ms)`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

// ── Session cache helpers ────────────────────────────────────────────────────

function saveSessionCache(token, expiresAt, user, guildId, channelId) {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const sessions = parsed?.version === 2 && parsed.sessions && typeof parsed.sessions === 'object'
      ? parsed.sessions
      : {};
    const key = sessionCacheKey(guildId, channelId);
    sessions[key] = {token, expiresAt, user, guildId, channelId, savedAt: Date.now()};

    const entries = Object.entries(sessions)
      .sort(([, left], [, right]) => (right?.savedAt || 0) - (left?.savedAt || 0))
      .slice(0, MAX_SESSION_CACHE_ENTRIES);
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({version: 2, sessions: Object.fromEntries(entries)}));
    localStorage.removeItem(LEGACY_SESSION_CACHE_KEY);
  } catch {}
}

function sessionCacheKey(guildId, channelId) {
  return `${guildId || 'unknown'}:${channelId || 'unknown'}`;
}

function loadSessionCache(guildId, channelId) {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    let cached = parsed?.version === 2
      ? parsed.sessions?.[sessionCacheKey(guildId, channelId)]
      : null;

    // Migrate the original single-session cache without making the user log in again.
    if (!cached) {
      const legacyRaw = localStorage.getItem(LEGACY_SESSION_CACHE_KEY);
      const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
      if (legacy?.guildId === guildId && legacy?.channelId === channelId) cached = legacy;
    }

    if (!cached?.token || !cached?.expiresAt) return null;
    // Must match the same guild (different servers = different sessions)
    if (guildId && cached.guildId && cached.guildId !== guildId) return null;
    // Channel-scoped authorization must be refreshed when the Activity opens
    // from another Discord channel, including legacy sessions without a channel.
    if (channelId && cached.channelId !== channelId) return null;
    // Leave a 5-minute buffer before actual expiry
    if (Date.parse(cached.expiresAt) - 5 * 60 * 1000 <= Date.now()) return null;
    return cached;
  } catch {
    return null;
  }
}

function clearSessionCache(guildId, channelId) {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.version === 2 && parsed.sessions && typeof parsed.sessions === 'object') {
      delete parsed.sessions[sessionCacheKey(guildId, channelId)];
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(parsed));
    }

    const legacyRaw = localStorage.getItem(LEGACY_SESSION_CACHE_KEY);
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
    if (!guildId || (legacy?.guildId === guildId && legacy?.channelId === channelId)) {
      localStorage.removeItem(LEGACY_SESSION_CACHE_KEY);
    }
  } catch {}
}

async function verifySessionToken(token) {
  try {
    const res = await fetch('/api/docs', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function refreshDiscordSessionInBackground({sdk, clientId, guildId, channelId, cached, customId}) {
  try {
    const authResult = await withTimeout(
      sdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        state: '',
        scope: ['identify', 'guilds'],
        prompt: 'none',
      }),
      AUTH_TIMEOUT_MS,
      'Discord silent authorize',
    );
    if (!authResult?.code) return;

    const tokenResponse = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: JSON.stringify({code: authResult.code, guildId, channelId}),
      cache: 'no-store',
    });
    const tokenPayload = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !tokenPayload?.access_token) return;

    await withTimeout(
      sdk.commands.authenticate({access_token: tokenPayload.access_token}),
      AUTH_TIMEOUT_MS,
      'Discord silent authenticate',
    );
    if (tokenPayload.bardo_token) {
      saveSessionCache(tokenPayload.bardo_token, tokenPayload.expires_at, cached.user, guildId, channelId);
      installBardoApiSession({token: tokenPayload.bardo_token, customId});
      window.__BARDO_SESSION_TOKEN__ = tokenPayload.bardo_token;
      logBreadcrumb('session_refresh_success');
    }
  } catch (error) {
    // Refreshing a still-valid Bardo session is best-effort and must never hold
    // the first render hostage.
    logBreadcrumb('silent_authorize_skipped', {reason: error?.message});
  }
}

// ── Main auth ────────────────────────────────────────────────────────────────

export async function authenticateBardoDiscord({onStageChange = () => {}} = {}) {
  logBreadcrumb('activity_boot_started');
  onStageChange('activity_boot_started');

  if (!isEmbeddedActivity()) {
    logBreadcrumb('render_ready', {mode: 'standalone'});
    return {
      embedded: false,
      ready: true,
      sdk: null,
      guildId: null,
      user: null,
      customId: null,
    };
  }

  let activeGuildId = null;
  let activeChannelId = null;

  try {
    const clientId = resolveClientId();
    const {DiscordSDK} = await import('@discord/embedded-app-sdk');
    const sdk = new DiscordSDK(clientId);

    onStageChange('sdk_ready');
    await withTimeout(sdk.ready(), SDK_READY_TIMEOUT_MS, 'Discord SDK ready');
    logBreadcrumb('sdk_ready', {clientId});

    onStageChange('guild_context_ready');
    const guildId = sdk.guildId || new URLSearchParams(window.location.search).get('guild_id') || null;
    const channelId = sdk.channelId || new URLSearchParams(window.location.search).get('channel_id') || null;
    activeGuildId = guildId;
    activeChannelId = channelId;
    if (!guildId) {
      logBreadcrumb('guild_context_missing');
      return {
        embedded: true,
        ready: false,
        sdk,
        guildId: null,
        channelId: null,
        user: null,
        message: 'Bardo Docs debe abrirse desde un servidor de Discord para consultar los documentos de ese servidor.',
      };
    }
    logBreadcrumb('guild_context_ready', {guildId});

    // ── Try cached session first to skip OAuth prompt ─────────────────────
    const cached = loadSessionCache(guildId, channelId);
    if (cached) {
      logBreadcrumb('session_cache_found');
      const initialDocsPayload = await verifySessionToken(cached.token);
      if (initialDocsPayload) {
        logBreadcrumb('session_cache_restored', {userId: cached.user?.id});
        const customId = launchCustomId(sdk);
        installBardoApiSession({token: cached.token, customId});

        window.__BARDO_PRODUCTION__ = true;
        window.__BARDO_DISCORD_SDK__ = sdk;
        window.__BARDO_SESSION_TOKEN__ = window.__BARDO_SESSION_TOKEN__ || cached.token;
        window.__BARDO_GUILD_ID__ = guildId;
        window.__BARDO_CHANNEL_ID__ = channelId;
        window.__BARDO_USER__ = cached.user;
        window.__BARDO_CUSTOM_ID__ = customId;
        window.__BARDO_INSTANCE_ID__ = sdk.instanceId || new URLSearchParams(window.location.search).get('instance_id') || null;

        void refreshDiscordSessionInBackground({sdk, clientId, guildId, channelId, cached, customId});

        onStageChange('render_ready');
        return {
          embedded: true,
          ready: true,
          sdk,
          guildId,
          channelId,
          user: cached.user,
          customId,
          sessionToken: window.__BARDO_SESSION_TOKEN__,
          instanceId: window.__BARDO_INSTANCE_ID__,
          initialDocsPayload,
        };
      }
      // Cache was stale — clear and do full auth
      logBreadcrumb('session_cache_expired');
      clearSessionCache(guildId, channelId);
    }

    // ── Full OAuth flow ───────────────────────────────────────────────────
    onStageChange('authorize_started');
    logBreadcrumb('authorize_started');
    // Note: prompt is intentionally omitted to support first-time user authorization without errors
    const authResult = await withTimeout(
      sdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        state: '',
        scope: ['identify', 'guilds'],
      }),
      AUTH_TIMEOUT_MS,
      'Discord authorize',
    );
    const code = authResult?.code;
    if (!code) {
      throw new Error('Discord no devolvió un código de autorización.');
    }
    onStageChange('authorize_success');
    logBreadcrumb('authorize_success');

    onStageChange('token_exchange_success');
    const tokenResponse = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: JSON.stringify({code, guildId, channelId}),
      cache: 'no-store',
    });

    const tokenPayload = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !tokenPayload?.access_token || !tokenPayload?.bardo_token) {
      const message = tokenPayload?.error || `Error en servidor Bardo (HTTP ${tokenResponse.status})`;
      throw new Error(message);
    }
    logBreadcrumb('token_exchange_success');

    onStageChange('authenticate_success');
    const auth = await withTimeout(
      sdk.commands.authenticate({access_token: tokenPayload.access_token}),
      AUTH_TIMEOUT_MS,
      'Discord authenticate',
    );

    if (!auth?.user?.id) {
      throw new Error('Discord no devolvió la identidad del usuario.');
    }
    if (tokenPayload.user?.id && tokenPayload.user.id !== auth.user.id) {
      throw new Error('La identidad autenticada por Discord no coincide con la sesión de Bardo.');
    }
    logBreadcrumb('authenticate_success', {userId: auth.user.id});

    const customId = launchCustomId(sdk);
    installBardoApiSession({token: tokenPayload.bardo_token, customId});

    // Persist session so next launch skips the OAuth prompt
    saveSessionCache(tokenPayload.bardo_token, tokenPayload.expires_at, auth.user, guildId, channelId);

    window.__BARDO_PRODUCTION__ = true;
    window.__BARDO_DISCORD_SDK__ = sdk;
    window.__BARDO_SESSION_TOKEN__ = tokenPayload.bardo_token;
    window.__BARDO_GUILD_ID__ = guildId;
    window.__BARDO_CHANNEL_ID__ = channelId;
    window.__BARDO_USER__ = auth.user;
    window.__BARDO_CUSTOM_ID__ = customId;
    window.__BARDO_INSTANCE_ID__ = sdk.instanceId || new URLSearchParams(window.location.search).get('instance_id') || null;

    onStageChange('render_ready');
    return {
      embedded: true,
      ready: true,
      sdk,
      guildId,
      channelId,
      user: auth.user,
      customId,
      sessionToken: tokenPayload.bardo_token,
      instanceId: window.__BARDO_INSTANCE_ID__,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logBreadcrumb('bootstrap_error', {error: errorMsg});
    console.error('Bardo Docs: autenticación Discord falló', error);
    clearSessionCache(activeGuildId, activeChannelId);
    return {
      embedded: true,
      ready: false,
      sdk: null,
      guildId: null,
      user: null,
      message: `No pudimos autenticar tu sesión en este servidor: ${errorMsg}`,
      error,
    };
  }
}
