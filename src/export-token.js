// Short-lived signed links for downloading an exported document outside the
// Discord Activity iframe (where downloads are unreliable). The Activity asks
// for a link with its session (POST /api/docs/:id/export-link) and opens it
// in the system browser; the browser has no session, so the link itself
// carries an HMAC-signed grant for one document + format + user, valid 5 min.

export const EXPORT_LINK_TTL_MS = 5 * 60 * 1000;
const KEY_LABEL = 'bardo-export-v1';
const encoder = new TextEncoder();

const FORMAT_ALIASES = {
  md: 'md', markdown: 'md',
  docx: 'docx', word: 'docx', doc: 'docx',
  pdf: 'pdf',
  // The uploaded file itself (PDF/DOCX/MD/TXT), as stored before normalization.
  original: 'original', fuente: 'original', source: 'original',
};

/** 'md' | 'docx' | 'pdf' | 'original', or null for anything else. */
export function normalizeExportFormat(value) {
  return FORMAT_ALIASES[String(value ?? '').trim().toLowerCase()] || null;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlDecode(text) {
  const padded = String(text).replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmacKey(secret) {
  // Derive a dedicated key from the client secret with a fixed label, so the
  // raw secret is never used directly and other uses can't collide.
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derived = await crypto.subtle.sign('HMAC', baseKey, encoder.encode(KEY_LABEL));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function exportSecret(env) {
  const secret = String(env?.DISCORD_CLIENT_SECRET || '').trim();
  return secret || null;
}

export function exportLinksConfigured(env) {
  return Boolean(exportSecret(env));
}

/** Signs `{docId, format, userId, exp}` → `<payload>.<signature>` (base64url). */
export async function createExportToken(env, { docId, format, userId, now = Date.now() }) {
  const secret = exportSecret(env);
  if (!secret) throw new Error('DISCORD_CLIENT_SECRET is not configured');
  const exp = now + EXPORT_LINK_TTL_MS;
  const payload = base64UrlEncode(encoder.encode(JSON.stringify({ docId, format, userId, exp })));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload));
  return { token: `${payload}.${base64UrlEncode(new Uint8Array(signature))}`, expiresAt: new Date(exp).toISOString() };
}

/**
 * Verifies a token for exactly this document and format.
 * Returns `{ok: true, userId}` or `{ok: false, reason: 'invalid' | 'expired'}`.
 */
export async function verifyExportToken(env, token, { docId, format, now = Date.now() }) {
  const secret = exportSecret(env);
  const [payload, signature, extra] = String(token || '').split('.');
  if (!secret || !payload || !signature || extra !== undefined) return { ok: false, reason: 'invalid' };

  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), base64UrlDecode(signature), encoder.encode(payload));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'invalid' };

  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (claims?.docId !== docId || claims?.format !== format) return { ok: false, reason: 'invalid' };
  if (!Number.isFinite(claims?.exp) || claims.exp <= now) return { ok: false, reason: 'expired' };
  return { ok: true, userId: claims.userId || null };
}
