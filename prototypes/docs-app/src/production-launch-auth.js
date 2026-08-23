const API_PREFIXES = ['/api/docs', '/api/documents'];
let installed = false;
let sessionToken = null;
let launchCustomId = null;

function isBardoDataRequest(input) {
  try {
    const raw = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input?.url || '';
    const url = new URL(raw, window.location.href);
    return API_PREFIXES.some(prefix => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  } catch {
    return false;
  }
}

function ensureInterceptor() {
  if (installed) return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = function bardoAuthenticatedFetch(input, init = {}) {
    if (!isBardoDataRequest(input)) {
      return nativeFetch(input, init);
    }

    const inheritedHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(inheritedHeaders || init.headers || undefined);
    if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
    if (launchCustomId) headers.set('x-bardo-custom-id', launchCustomId);

    if (input instanceof Request) {
      return nativeFetch(new Request(input, {...init, headers}));
    }

    return nativeFetch(input, {...init, headers});
  };
}

export function installBardoApiSession({token, customId} = {}) {
  if (token) sessionToken = token;
  if (customId) launchCustomId = customId;
  ensureInterceptor();
  return Boolean(sessionToken);
}

// Backward-compatible alias for old build paths. custom_id is routing context,
// never authentication by itself.
export function installBardoLaunchAuth(customId) {
  return installBardoApiSession({customId});
}
