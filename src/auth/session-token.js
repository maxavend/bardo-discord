const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeJson(value) {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson(value) {
  return JSON.parse(decoder.decode(base64UrlToBytes(value)));
}

async function importHmacKey(secret) {
  const cleanSecret = String(secret || '');
  if (cleanSecret.length < 16) throw new Error('Activity session signing secret is unavailable.');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(cleanSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createActivitySessionToken({
  secret,
  instanceId,
  userId,
  guildId = null,
  scopes = [],
  expiresInSeconds = 3600,
  now = Date.now(),
}) {
  const issuedAt = Math.floor(now / 1000);
  const ttl = Math.max(60, Math.min(3600, Number(expiresInSeconds) || 3600));
  const payload = {
    v: 1,
    sub: String(userId || ''),
    instance: String(instanceId || ''),
    guild: guildId ? String(guildId) : null,
    scopes: Array.isArray(scopes) ? scopes.map(String).slice(0, 32) : [],
    iat: issuedAt,
    exp: issuedAt + ttl,
  };
  if (!payload.sub || !payload.instance) throw new Error('Activity session identity is incomplete.');

  const encoded = encodeJson(payload);
  const key = await importHmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(encoded)));
  return `${encoded}.${bytesToBase64Url(signature)}`;
}

export async function verifyActivitySessionToken(token, {
  secret,
  expectedInstanceId = null,
  now = Date.now(),
} = {}) {
  const [encoded, signaturePart, extra] = String(token || '').split('.');
  if (!encoded || !signaturePart || extra) return null;

  let signature;
  let payload;
  try {
    signature = base64UrlToBytes(signaturePart);
    payload = decodeJson(encoded);
  } catch {
    return null;
  }

  const key = await importHmacKey(secret).catch(() => null);
  if (!key) return null;
  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(encoded)).catch(() => false);
  if (!valid) return null;

  const nowSeconds = Math.floor(now / 1000);
  if (payload?.v !== 1 || !payload.sub || !payload.instance) return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds) return null;
  if (!Number.isFinite(payload.iat) || payload.iat > nowSeconds + 60) return null;
  if (expectedInstanceId && payload.instance !== expectedInstanceId) return null;

  return payload;
}

export function readBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || null;
}
