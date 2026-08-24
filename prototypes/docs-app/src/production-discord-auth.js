import {DiscordSDK} from '@discord/embedded-app-sdk';
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
    const sdk = new DiscordSDK(clientId);

    onStageChange('sdk_ready');
    await withTimeout(sdk.ready(), SDK_READY_TIMEOUT_MS, 'Discord SDK ready');
    logBreadcrumb('sdk_ready', {clientId});

    onStageChange('guild_context_ready');
    const guildId = sdk.guildId || new URLSearchParams(window.location.search).get('guild_id') || null;
    if (!guildId) {
      logBreadcrumb('guild_context_missing');
      return {
        embedded: true,
        ready: false,
        sdk,
        guildId: null,
        user: null,
        message: 'Bardo Docs debe abrirse desde un servidor de Discord para consultar los documentos de ese servidor.',
      };
    }
    logBreadcrumb('guild_context_ready', {guildId});

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
      body: JSON.stringify({code, guildId}),
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

    window.__BARDO_PRODUCTION__ = true;
    window.__BARDO_DISCORD_SDK__ = sdk;
    window.__BARDO_SESSION_TOKEN__ = tokenPayload.bardo_token;
    window.__BARDO_GUILD_ID__ = guildId;
    window.__BARDO_USER__ = auth.user;
    window.__BARDO_CUSTOM_ID__ = customId;
    window.__BARDO_INSTANCE_ID__ = sdk.instanceId || new URLSearchParams(window.location.search).get('instance_id') || null;

    return {
      embedded: true,
      ready: true,
      sdk,
      guildId,
      user: auth.user,
      customId,
      sessionToken: tokenPayload.bardo_token,
      instanceId: window.__BARDO_INSTANCE_ID__,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logBreadcrumb('bootstrap_error', {error: errorMsg});
    console.error('Bardo Docs: autenticación Discord falló', error);
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
