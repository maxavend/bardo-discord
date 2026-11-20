import {readRequestBytes} from './request-body.js';

const KIB = 1024;

function securityError(status, error, message, retryAfter) {
  return new Response(JSON.stringify({error, message}), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Public OAuth/MCP clients must be able to read throttling/body errors.
      'Access-Control-Allow-Origin': '*',
      ...(retryAfter ? {'Retry-After': String(retryAfter)} : {}),
    },
  });
}

export function bodyTooLargeResponse() {
  return securityError(413, 'too_large', 'La solicitud es demasiado grande. Reduce su contenido e inténtalo de nuevo.');
}

/** Limit bytes before any handler parses JSON, forms or Discord signatures. */
export async function boundRequestBody(request) {
  if (!request.body) return request;
  const {pathname} = new URL(request.url);
  let maxBytes = 256 * KIB; // Signed Discord interactions and unknown routes.
  if (pathname === '/api/csp-report' || pathname === '/api/client-error' || pathname.startsWith('/oauth/')
      || pathname.startsWith('/auth/') || pathname.startsWith('/api/auth/')
      || pathname.startsWith('/api/settings') || pathname.startsWith('/api/web/')) {
    maxBytes = 8 * KIB;
  } else if (pathname.startsWith('/api/planner')) {
    maxBytes = 512 * KIB;
  } else if (pathname.startsWith('/api/kanban')) {
    maxBytes = 64 * KIB;
  } else if (pathname === '/mcp' || pathname.startsWith('/api/docs')
      || pathname.startsWith('/api/documents/')) {
    maxBytes = 4 * 1024 * KIB;
  }
  const bytes = await readRequestBytes(request, maxBytes);
  // Preserve the exact bytes: Discord signatures cover the original body.
  return new Request(request, {body: bytes});
}

async function enforceLimit(binding, key) {
  // Tests and local consumers can run without Cloudflare bindings. Production
  // bindings are declared in wrangler.jsonc, never a per-isolate Map fallback.
  if (!binding) return null;
  try {
    const {success} = await binding.limit({key});
    if (success) return null;
    return securityError(429, 'rate_limited', 'Hay demasiadas solicitudes. Espera un minuto y vuelve a intentarlo.', 60);
  } catch {
    return securityError(503, 'rate_limit_unavailable', 'No se pudo comprobar el límite de solicitudes. Inténtalo de nuevo en unos segundos.', 10);
  }
}

/** Only call with an authenticated Discord user ID, never caller input. */
export function enforceUserRateLimit(env, userId) {
  return enforceLimit(env.API_RATE_LIMITER, `bardo:user:${userId}`);
}

export function enforceInteractionRateLimit(env, userId) {
  return enforceLimit(env.INTERACTION_RATE_LIMITER, `bardo:interaction:${userId}`);
}

export function enforcePublicRateLimit(request, env) {
  const {pathname} = new URL(request.url);
  if (request.method === 'OPTIONS') return null;
  let bucket;
  if (pathname === '/api/csp-report') bucket = 'csp';
  else if (pathname === '/api/client-error') bucket = 'client-error';
  else if (pathname.startsWith('/oauth/')) bucket = 'oauth';
  else if (pathname.startsWith('/auth/')) bucket = 'web-auth';
  else if (pathname === '/api/auth/token') bucket = 'activity-auth';
  else return null;
  // Only Cloudflare's edge address is trusted. X-Forwarded-For is caller input.
  // These endpoints have no verified user yet; authenticated traffic is keyed
  // by user ID above so Discord's shared proxy does not pool users together.
  const address = request.headers.get('CF-Connecting-IP');
  if (!address) return null;
  return enforceLimit(env.AUTH_RATE_LIMITER, `bardo:${bucket}:${address}`);
}
