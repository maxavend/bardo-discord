// SDK 2.x bundles its own Zod parser. Bound RPC input before that parser can
// expand an untrusted collection into thousands of validation errors.
const MAX_COLLECTION_ITEMS = 2048;
const MAX_VALUES = 30_000;
const MAX_STRING_CHARS = 1024 * 1024;
const MAX_DEPTH = 32;
const guardedWindows = new WeakSet();
// What Discord actually sent, kept only to explain a failed start (see rpcSupportRef).
const seenRpc = {messages: 0, blocked: 0, foreign: 0, close: 0};

/**
 * Short, non-sensitive reference for the boot error screen. It tells apart
 * "Discord never answered" (m0), "the guard dropped it" (b>0), "Discord closed
 * the connection" (c = close code) and "answers came from an origin the SDK
 * ignores" (x>0), so a screenshot is enough to diagnose a timeout.
 */
export function rpcSupportRef(step, target = globalThis.window) {
  let opener = '?';
  try { opener = target?.parent?.opener ? '1' : '0'; } catch { /* cross-origin: unknown */ }
  let referrer = 'e';
  try {
    const host = new URL(globalThis.document?.referrer || '').hostname;
    referrer = /(^|\.)discord(app)?\.com$/.test(host) ? 'd' : /\.discordsays\.com$/.test(host) ? 's' : 'o';
  } catch { /* empty referrer */ }
  return `${step}-m${seenRpc.messages}-b${seenRpc.blocked}-x${seenRpc.foreign}-c${seenRpc.close}-o${opener}-r${referrer}`;
}

function noteRpcMessage(event, blocked) {
  try {
    seenRpc.messages += 1;
    if (blocked) seenRpc.blocked += 1;
    const origin = String(event.origin || '');
    if (origin !== 'null' && !/^https:\/\/([a-z0-9-]+\.)?discord(app)?\.com$/.test(origin)) seenRpc.foreign += 1;
    const code = Number(event.data[1]?.code);
    if (event.data[0] === 2 && Number.isFinite(code)) seenRpc.close = code;
  } catch { /* diagnostics never affect delivery */ }
}

export function isBoundedDiscordMessage(data) {
  const pending = [{value: data, depth: 0}];
  let values = 0;
  let stringChars = 0;
  while (pending.length) {
    const {value, depth} = pending.pop();
    if (++values > MAX_VALUES || depth > MAX_DEPTH) return false;
    if (typeof value === 'string') {
      stringChars += value.length;
      if (stringChars > MAX_STRING_CHARS) return false;
    } else if (value && typeof value === 'object') {
      // No "already seen" shortcut: structured clone keeps shared references,
      // so a harmless payload can repeat an object. Cycles still stop at the
      // depth and value budgets.
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
    const guard = event => {
      // Non-array messages are ignored by Discord's SDK too.
      if (!Array.isArray(event.data)) return;
      let blocked = true;
      try {
        // Only bound the size. The SDK validates the origin itself; Discord's
        // replies do not always come from the window the SDK posts to, so a
        // source check here dropped READY and `sdk.ready()` timed out.
        blocked = !isBoundedDiscordMessage(event.data);
      } catch { /* unreadable input stays blocked */ }
      if (blocked) event.stopImmediatePropagation();
      noteRpcMessage(event, blocked);
    };
    target.addEventListener?.('message', guard, {capture: true});
    guardedWindows.add(target);
  }
  return new DiscordSDK(clientId, configuration);
}
