const API_PREFIX = '/api/docs';
let installed = false;

function isDocsApiRequest(input) {
  try {
    const raw = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input?.url || '';
    const url = new URL(raw, window.location.href);
    return url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`);
  } catch {
    return false;
  }
}

export function installBardoLaunchAuth(customId) {
  if (installed || !customId) return false;
  installed = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = function bardoLaunchFetch(input, init = {}) {
    if (!isDocsApiRequest(input)) {
      return nativeFetch(input, init);
    }

    const inheritedHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(inheritedHeaders || init.headers || undefined);
    headers.set('x-bardo-custom-id', customId);

    if (input instanceof Request) {
      return nativeFetch(new Request(input, {...init, headers}));
    }

    return nativeFetch(input, {...init, headers});
  };

  return true;
}
