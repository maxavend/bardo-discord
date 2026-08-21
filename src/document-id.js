export const BARDO_OPEN_PREFIX = 'bardo:open:';
const NON_DOCUMENT_PREFIXES = ['bardo:home:', 'bardo:board:', 'board:', 'bardo:event:', 'event:'];

export function normalizeDocumentId(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(BARDO_OPEN_PREFIX)) {
    const extracted = trimmed.slice(BARDO_OPEN_PREFIX.length).trim();
    return extracted || null;
  }
  if (NON_DOCUMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return null;
  return trimmed;
}
