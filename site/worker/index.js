// Sitio público de Bardo: sirve la landing compilada (`dist/`) y guarda la lista
// de espera de la versión web en D1. No comparte nada con el Worker de Discord.

const WAITLIST_PATH = '/api/lista-de-espera';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function handleWaitlist(request, env) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed', message: 'Método no permitido.' }, 405);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json', message: 'No se pudo leer el formulario. Inténtalo de nuevo.' }, 400);
  }

  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return json({ error: 'invalid_email', message: 'Ese correo parece incompleto. Escríbelo como nombre@ejemplo.com.' }, 400);
  }

  try {
    await env.DB.prepare('INSERT OR IGNORE INTO waitlist (email, created_at) VALUES (?, ?)')
      .bind(email, new Date().toISOString())
      .run();
  } catch (error) {
    console.error('Lista de espera: no se pudo guardar', error?.message || error);
    return json({ error: 'database_unavailable', message: 'No se pudo guardar tu correo. Inténtalo de nuevo en un minuto.' }, 503);
  }

  // Misma respuesta si el correo ya estaba: no revela quién se inscribió.
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === WAITLIST_PATH) return handleWaitlist(request, env);
    return env.ASSETS.fetch(request);
  },
};
