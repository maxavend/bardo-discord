// Inicio de sesión de la app: OAuth 2.1 con PKCE contra el servidor de Bardo y
// vuelta por loopback (RFC 8252). El navegador del sistema muestra Discord; la
// app nunca ve la contraseña ni el token de Discord, solo el código de Bardo.
import {createHash, randomBytes} from 'node:crypto';
import http from 'node:http';

const CALLBACK_PATH = '/oauth/callback';
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;

const base64Url = buffer => buffer.toString('base64url');

export function createPkce() {
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return {verifier, challenge};
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

// Mismos colores que las páginas de autorización de Bardo. Sin scripts.
function resultPage(title, message) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Bardo</title>
<style>:root{color-scheme:dark;--bg:oklch(.2 .014 292);--surface:oklch(.24 .016 292);--border:oklch(1 .02 300/.09);--text:oklch(.965 .006 305);--muted:oklch(.74 .02 300)}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:oklch(.985 .005 305);--surface:oklch(1 0 0);--border:oklch(.905 .012 305);--text:oklch(.2 .025 300);--muted:oklch(.5 .025 300)}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:28rem;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px}h1{font-size:1.25rem;margin:0 0 8px}p{margin:0;color:var(--muted)}</style>
</head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

export class SignInError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Abre el navegador en la autorización de Bardo y espera la vuelta en un puerto
 * local efímero. Devuelve {promise, cancel, reopen}; la promesa entrega
 * {code, redirectUri, verifier}.
 */
export function startLoopbackAuthorization({origin, clientId, scope, openBrowser, timeoutMs = SIGN_IN_TIMEOUT_MS}) {
  const {verifier, challenge} = createPkce();
  const state = base64Url(randomBytes(24));
  let settle;
  let authorizeUrl = null;
  const promise = new Promise((resolve, reject) => { settle = {resolve, reject}; });

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
      response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('No encontrado');
      return;
    }
    const send = (status, title, message) => response.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Referrer-Policy': 'no-referrer',
    }).end(resultPage(title, message));

    // Cualquier página del equipo podría pegarle a este puerto: sin el state exacto, nada.
    if (url.searchParams.get('state') !== state) {
      send(400, 'Este enlace no es válido', 'Vuelve a Bardo e inicia sesión de nuevo.');
      return;
    }
    if (url.searchParams.get('iss') && url.searchParams.get('iss') !== origin) {
      send(400, 'Este enlace no es válido', 'Vuelve a Bardo e inicia sesión de nuevo.');
      finish(new SignInError('invalid_issuer', 'La respuesta no vino de Bardo. Vuelve a intentarlo.'));
      return;
    }
    const error = url.searchParams.get('error');
    if (error) {
      send(200, 'Inicio de sesión cancelado', 'Puedes cerrar esta pestaña y volver a Bardo.');
      finish(new SignInError(error === 'access_denied' ? 'cancelled' : 'failed',
        error === 'access_denied' ? 'Cancelaste el inicio de sesión.' : 'No pudimos iniciar tu sesión. Vuelve a intentarlo.'));
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      send(400, 'Falta la autorización', 'Vuelve a Bardo e inicia sesión de nuevo.');
      return;
    }
    send(200, 'Listo, ya puedes volver a Bardo', 'Tu sesión quedó abierta en la app. Puedes cerrar esta pestaña.');
    finish(null, {code, redirectUri: redirectUri(), verifier});
  });

  let timer = null;
  let finished = false;
  function finish(error, value) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
    if (error) settle.reject(error);
    else settle.resolve(value);
  }
  const redirectUri = () => `http://127.0.0.1:${server.address().port}${CALLBACK_PATH}`;

  server.on('error', error => finish(new SignInError('loopback_failed', `No pudimos preparar el inicio de sesión (${error.code || 'error'}).`)));
  server.listen(0, '127.0.0.1', async () => {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri(),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope,
      state,
    });
    authorizeUrl = `${origin}/oauth/authorize?${params}`;
    timer = setTimeout(() => finish(new SignInError('expired', 'El inicio de sesión tardó demasiado. Vuelve a intentarlo.')), timeoutMs);
    try {
      await openBrowser(authorizeUrl);
    } catch {
      finish(new SignInError('browser_failed', 'No pudimos abrir tu navegador. Revisa que tengas uno predeterminado.'));
    }
  });

  return {
    promise,
    cancel: () => finish(new SignInError('cancelled', 'Cancelaste el inicio de sesión.')),
    reopen: () => (authorizeUrl && !finished ? openBrowser(authorizeUrl) : undefined),
  };
}
