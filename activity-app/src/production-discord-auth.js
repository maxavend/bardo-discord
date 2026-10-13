import {installBardoApiSession} from './production-launch-auth.js';

const FALLBACK_CLIENT_ID = '1539704001535156254';
const AUTH_TIMEOUT_MS = 15000;
const SDK_READY_TIMEOUT_MS = 10000;

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
  // Only Bardo component IDs describe a document/section. Discord may pass
  // other custom identifiers when opening from a command or app launcher.
  const component = [params.get('custom_id'), sdk?.customId]
    .find(value => typeof value === 'string' && value.startsWith('bardo:open:'));
  if (component) return component;
  const document = params.get('document')?.trim();
  if (document) return document.startsWith('bardo:open:') ? document : `bardo:open:${document}`;
  const legacyId = params.get('id')?.trim();
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(legacyId || '') ? `bardo:open:${legacyId}` : null;
}

export function isEmbeddedActivity() {
  const params = new URLSearchParams(window.location.search);
  return params.has('instance_id')
    || params.has('frame_id')
    || /\.discordsays\.com$/i.test(window.location.hostname || '');
}

/**
 * Mensaje en español para la pantalla de error de inicio. Nunca muestra el
 * texto técnico del SDK (queda en consola y breadcrumbs).
 */
export function friendlyAuthError(error) {
  const code = error?.code;
  const message = String(error?.message || '');
  if (code === 'timeout') {
    return 'Discord tardó demasiado en responder. Revisa tu conexión e intenta de nuevo.';
  }
  if (code === 5000 || code === 4002 || /cancel|denied|reject/i.test(message)) {
    return 'Bardo necesita tu permiso de Discord para abrirse. Vuelve a intentarlo y pulsa "Autorizar".';
  }
  if (code === 'token_exchange') {
    return `${message} Intenta de nuevo en unos segundos.`;
  }
  // Mensajes propios (en español) se muestran tal cual; los del SDK, no.
  if (/^(Discord no|La identidad|Bardo )/.test(message)) return `${message} Intenta de nuevo.`;
  return 'No pudimos conectar tu sesión de Discord con Bardo. Intenta de nuevo.';
}

function withTimeout(promise, ms, label) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const timeout = new Error('Discord tardó demasiado en responder.');
      timeout.code = 'timeout';
      timeout.detail = `${label} (${ms}ms)`;
      reject(timeout);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
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
    if (!guildId || !channelId) {
      logBreadcrumb('guild_context_missing');
      return {
        embedded: true,
        ready: false,
        sdk,
        guildId: null,
        channelId: null,
        user: null,
        message: 'Bardo debe abrirse desde un canal de un servidor de Discord para ver los documentos de ese canal.',
      };
    }
    logBreadcrumb('guild_context_ready', {guildId});

    // Never restore a persisted bearer token before Discord identifies the
    // current account. A shared browser may have switched users since launch.
    try {
      localStorage.removeItem('bardo_sessions_v2');
      localStorage.removeItem('bardo_session_v1');
    } catch {}

    // ── Full OAuth flow ───────────────────────────────────────────────────
    onStageChange('authorize_started');
    logBreadcrumb('authorize_started');
    // Note: prompt is intentionally omitted to support first-time user authorization without errors
    const authResult = await withTimeout(
      sdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        state: '',
        scope: ['identify'],
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
      const failure = new Error(typeof tokenPayload?.message === 'string' && tokenPayload.message.trim()
        ? tokenPayload.message
        : 'Bardo no pudo validar tu sesión de Discord.');
      failure.code = 'token_exchange';
      failure.detail = `${tokenPayload?.error || 'error'} (HTTP ${tokenResponse.status})`;
      throw failure;
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
    logBreadcrumb('bootstrap_error', {error: errorMsg, detail: error?.detail || null});
    console.error('Bardo Docs: autenticación Discord falló', error);
    return {
      embedded: true,
      ready: false,
      sdk: null,
      guildId: null,
      user: null,
      message: friendlyAuthError(error),
      error,
    };
  }
}
