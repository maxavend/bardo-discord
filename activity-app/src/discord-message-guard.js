// SDK 2.x bundles its own Zod parser. Bound RPC input before that parser can
// expand an untrusted collection into thousands of validation errors.
const MAX_COLLECTION_ITEMS = 2048;
const MAX_VALUES = 30_000;
const MAX_STRING_CHARS = 1024 * 1024;
const MAX_DEPTH = 32;
const guardedWindows = new WeakSet();

export function isBoundedDiscordMessage(data) {
  const pending = [{value: data, depth: 0}];
  const seen = new WeakSet();
  let values = 0;
  let stringChars = 0;
  while (pending.length) {
    const {value, depth} = pending.pop();
    if (++values > MAX_VALUES || depth > MAX_DEPTH) return false;
    if (typeof value === 'string') {
      stringChars += value.length;
      if (stringChars > MAX_STRING_CHARS) return false;
    } else if (value && typeof value === 'object') {
      if (seen.has(value)) return false;
      seen.add(value);
      if (Array.isArray(value) && value.length > MAX_COLLECTION_ITEMS) return false;
      let keys = 0;
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        if (++keys > MAX_COLLECTION_ITEMS || pending.length + values >= MAX_VALUES) return false;
        stringChars += key.length;
        if (stringChars > MAX_STRING_CHARS) return false;
        pending.push({value: value[key], depth: depth + 1});
      }
    }
  }
  return true;
}

/** Install before constructing the SDK, without replacing its private methods. */
export function createGuardedDiscordSdk(DiscordSDK, clientId, configuration, target = window) {
  if (!guardedWindows.has(target)) {
    // Same host as the SDK: a popout talks to the main window through opener.
    const source = target.parent?.opener ?? target.parent;
    const guard = event => {
      // Non-array messages are ignored by Discord's SDK too.
      if (!Array.isArray(event.data)) return;
      try {
        // Native Discord bridges may dispatch messages without a Window source.
        // Keep those compatible; the SDK still checks its origin allowlist.
        // Browser postMessage always has a source, including sandboxed frames.
        if ((event.source !== null && event.source !== source)
            || !isBoundedDiscordMessage(event.data)) {
          event.stopImmediatePropagation();
        }
      } catch {
        event.stopImmediatePropagation();
      }
    };
    target.addEventListener?.('message', guard, {capture: true});
    guardedWindows.add(target);
  }
  return new DiscordSDK(clientId, configuration);
}
