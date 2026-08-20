import { DiscordSDK } from '@discord/embedded-app-sdk';

const FALLBACK_CLIENT_ID = '1539704001535156254';
const originalFetch = window.fetch.bind(window);

function resolveClientId() {
  const host = window.location.hostname || '';
  return host.match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i)?.[1] || FALLBACK_CLIENT_ID;
}

function isEmbeddedActivity() {
  const params = new URLSearchParams(window.location.search);
  return params.has('instance_id') || params.has('frame_id') || window.location.hostname.endsWith('.discordsays.com');
}

function showRetryNotice(message) {
  let notice = document.querySelector('#bardo-api-retry-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'bardo-api-retry-notice';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10000;display:flex;align-items:center;gap:8px;max-width:360px;padding:10px 12px;border-radius:10px;background:#2b2d31;color:#f2f3f5;box-shadow:0 8px 30px rgba(0,0,0,.35);font:13px/1.35 system-ui,sans-serif';
    document.body.appendChild(notice);
  }
  notice.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Reintentar';
  retry.style.cssText = 'border:0;border-radius:7px;padding:6px 9px;background:#5865f2;color:white;font:600 12px system-ui,sans-serif;cursor:pointer';
  retry.addEventListener('click', () => window.location.reload());
  notice.append(text, retry);
}

async function authenticateActivity() {
  const params = new URLSearchParams(window.location.search);
  const instanceId = params.get('instance_id') || null;
  if (!isEmbeddedActivity() || !instanceId) {
    return { instanceId, guildId: null, sessionToken: null, accessToken: null, sdk: null };
  }

  const sdk = new DiscordSDK(resolveClientId());
  await sdk.ready();
  const guildId = sdk.guildId || params.get('guild_id') || null;

  const authorization = await sdk.commands.authorize({
    client_id: resolveClientId(),
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });
  if (!authorization?.code) throw new Error('Discord no devolvió un código de autorización.');

  const response = await originalFetch('/api/auth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bardo-instance-id': instanceId,
      ...(guildId ? { 'x-bardo-guild-id': guildId } : {}),
    },
    body: JSON.stringify({ code: authorization.code }),
  });
  if (!response.ok) throw new Error(`No se pudo autenticar la Activity (HTTP ${response.status}).`);

  const tokens = await response.json();
  if (!tokens?.access_token || !tokens?.session_token) throw new Error('La sesión de Activity está incompleta.');
  await sdk.commands.authenticate({ access_token: tokens.access_token });

  return {
    instanceId,
    guildId,
    sessionToken: tokens.session_token,
    accessToken: tokens.access_token,
    sdk,
  };
}

const state = {
  instanceId: new URLSearchParams(window.location.search).get('instance_id') || null,
  guildId: null,
  sessionToken: null,
  accessToken: null,
  sdk: null,
  error: null,
};

const authPromise = authenticateActivity()
  .then((next) => Object.assign(state, next))
  .catch((error) => {
    state.error = error;
    console.error('No se pudo autenticar Bardo dentro de Discord:', error);
    if (isEmbeddedActivity()) showRetryNotice('No pudimos validar tu sesión de Bardo.');
    return state;
  });

globalThis.__bardoActivityAuth = { state, ready: authPromise };

// Compatibility fallback for the pre-existing Kanban task picker. The settings
// dialog defines a richer local resolver; outside that scope an unresolved role
// must degrade gracefully instead of throwing ReferenceError.
globalThis.getMemberRoleBadge ||= (() => null);

async function performPrivateFetch(input, init, headers) {
  if (input instanceof Request) return originalFetch(new Request(input, { ...init, headers }));
  return originalFetch(input, { ...init, headers });
}

window.fetch = async (input, init = {}) => {
  const requestUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(requestUrl, window.location.href);
  const isPrivateBardoApi = url.origin === window.location.origin
    && url.pathname.startsWith('/api/')
    && url.pathname !== '/api/auth/token';

  if (!isPrivateBardoApi) return originalFetch(input, init);

  const auth = await authPromise;
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
  if (auth.instanceId) headers.set('x-bardo-instance-id', auth.instanceId);
  if (auth.guildId) headers.set('x-bardo-guild-id', auth.guildId);
  if (auth.sessionToken) headers.set('Authorization', `Bearer ${auth.sessionToken}`);

  let response;
  try {
    response = await performPrivateFetch(input, init, headers);
  } catch (error) {
    if (/\/guild-(?:members|roles)/.test(url.pathname)) showRetryNotice('No pudimos cargar las personas del servidor.');
    throw error;
  }

  if (response.status === 409 && /\/api\/boards\//.test(url.pathname) && !(input instanceof Request)) {
    const conflict = await response.clone().json().catch(() => null);
    if (conflict?.code === 'COLUMN_HAS_TASKS' && conflict.suggestedDestinationId) {
      const count = Number(conflict.affectedCount || 0);
      const confirmed = window.confirm(`Esta columna contiene ${count} tarea${count === 1 ? '' : 's'}. ¿Moverla${count === 1 ? '' : 's'} a otra columna y eliminarla?`);
      if (confirmed) {
        headers.set('x-bardo-confirm-column-move', conflict.suggestedDestinationId);
        response = await performPrivateFetch(input, init, headers);
      }
    }
  }

  if (/\/guild-(?:members|roles)/.test(url.pathname) && response.status >= 500) {
    showRetryNotice('No pudimos cargar las personas del servidor.');
  }
  if ((response.status === 401 || response.status === 403) && isEmbeddedActivity()) {
    showRetryNotice('Tu sesión de Bardo ya no es válida.');
  }
  return response;
};
