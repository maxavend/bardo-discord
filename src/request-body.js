/** Read untrusted bodies without buffering bytes beyond the endpoint's limit. */
export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large');
    this.name = 'RequestBodyTooLargeError';
    this.status = 413;
  }
}

/** Accepts a Request or Response. Content-Length is only an early rejection. */
export async function readRequestBytes(message, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Invalid body limit');
  const declared = Number(message.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await message.body?.cancel().catch(() => {});
    throw new RequestBodyTooLargeError();
  }
  if (!message.body) return new Uint8Array();

  const reader = message.body.getReader();
  // Keep one growing buffer: retaining millions of tiny chunks would make the
  // allocation overhead unbounded relative to the allowed number of bytes.
  let bytes = new Uint8Array(Math.min(maxBytes, 16 * 1024));
  let total = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      const nextTotal = total + value.byteLength;
      if (nextTotal > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyTooLargeError();
      }
      if (nextTotal > bytes.byteLength) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(nextTotal, bytes.byteLength * 2)));
        grown.set(bytes);
        bytes = grown;
      }
      bytes.set(value, total);
      total = nextTotal;
    }
  } finally {
    reader.releaseLock();
  }
  return bytes.subarray(0, total);
}

export async function readRequestText(message, maxBytes) {
  return new TextDecoder().decode(await readRequestBytes(message, maxBytes));
}
