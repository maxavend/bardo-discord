import {SECURITY_HEADERS} from './security.js';

function errorResponse(request, status, error) {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify({error}), {
    status,
    headers: {...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'},
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Retired endpoint: no body parsing, storage or database binding.
    if (url.pathname === '/api/lista-de-espera') return errorResponse(request, 410, 'endpoint_retired');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return errorResponse(request, 404, 'not_found');
    if (!['GET', 'HEAD'].includes(request.method)) return errorResponse(request, 405, 'method_not_allowed');
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
    return response;
  },
};
