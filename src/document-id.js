export const BARDO_OPEN_PREFIX = 'bardo:open:';

export function normalizeDocumentId(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(BARDO_OPEN_PREFIX)) {
    const extracted = trimmed.slice(BARDO_OPEN_PREFIX.length).trim();
    return extracted || null;
  }
  return trimmed;
}
