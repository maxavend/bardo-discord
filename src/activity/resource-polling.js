const nativeFetch = window.fetch.bind(window);
const nativeSetInterval = window.setInterval.bind(window);
const nativeClearInterval = window.clearInterval.bind(window);
const nativeSetTimeout = window.setTimeout.bind(window);
const nativeClearTimeout = window.clearTimeout.bind(window);
const nativeResponseJson = Response.prototype.json;

const resourceCache = new Map();
const adaptiveTimers = new Map();
let nextAdaptiveId = 1;
let lastInteractionAt = Date.now();
let failureStreak = 0;

function trackedResource(url, method) {
  if (method !== 'GET' || url.origin !== location.origin) return false;
  return /^\/api\/(?:boards|events)\/[^/]+$/.test(url.pathname);
}

function isMutation(url, method) {
  return url.origin === location.origin && url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

function looksLikePlannerPayload(payload) {
  return Boolean(
    payload && typeof payload === 'object' && payload.guildId &&
    Array.isArray(payload.blocks) && Array.isArray(payload.participants) && Array.isArray(payload.boards),
  );
}

if (!globalThis.__bardoResponseJsonBridgeInstalled) {
  globalThis.__bardoResponseJsonBridgeInstalled = true;
  Response.prototype.json = async function bardoResponseJson() {
    const payload = await nativeResponseJson.call(this);
    if (looksLikePlannerPayload(payload)) {
      if (!Array.isArray(payload.guildMembers)) payload.guildMembers = [];
      globalThis.__bardoPlannerData = payload;
    }
    return payload;
  };
}

function markInteraction() {
  lastInteractionAt = Date.now();
}

for (const type of ['pointerdown', 'keydown', 'input']) {
  window.addEventListener(type, markInteraction, { passive: true, capture: true });
}

function dynamicDelay() {
  const idleMs = Date.now() - lastInteractionAt;
  const base = idleMs < 30_000 ? 5_000 : idleMs < 2 * 60_000 ? 12_000 : 30_000;
  const backoff = Math.min(4, 2 ** Math.min(failureStreak, 2));
  return Math.min(60_000, base * backoff);
}

async function cachedResponse(entry) {
  return new Response(entry.body, {
    status: 200,
    headers: {
      ...entry.headers,
      'X-Bardo-Not-Modified': '1',
      'Cache-Control': 'private, no-cache',
    },
  });
}

window.fetch = async (input, init = {}) => {
  const request = input instanceof Request ? input : null;
  const method = String(init.method || request?.method || 'GET').toUpperCase();
  const url = new URL(request?.url || String(input), location.href);
  const track = trackedResource(url, method);
  const cacheKey = track ? `${method}:${url.pathname}` : null;
  const cached = cacheKey ? resourceCache.get(cacheKey) : null;
  const headers = new Headers(request?.headers || undefined);
  new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
  if (cached?.etag && !headers.has('If-None-Match')) headers.set('If-None-Match', cached.etag);

  try {
    const response = await nativeFetch(input, { ...init, headers });
    if (track && response.status === 304 && cached) {
      failureStreak = 0;
      return cachedResponse(cached);
    }
    if (track && response.ok) {
      failureStreak = 0;
      const etag = response.headers.get('etag');
      if (etag) {
        const body = await response.clone().text();
        const responseHeaders = {};
        for (const [key, value] of response.headers.entries()) responseHeaders[key] = value;
        resourceCache.set(cacheKey, { etag, body, headers: responseHeaders });
      }
    } else if (track && response.status >= 500) failureStreak += 1;
    if (isMutation(url, method) && response.ok) {
      markInteraction();
      failureStreak = 0;
      for (const key of resourceCache.keys()) {
        if (url.pathname.startsWith('/api/tasks/') || url.pathname.includes('/tasks')) {
          if (key.startsWith('GET:/api/boards/')) resourceCache.delete(key);
        } else if (url.pathname.startsWith('/api/events/')) {
          if (key.startsWith('GET:/api/events/')) resourceCache.delete(key);
        }
      }
    }
    return response;
  } catch (error) {
    if (track) failureStreak += 1;
    throw error;
  }
};

function scheduleAdaptive(timer) {
  nativeClearTimeout(timer.timeoutId);
  if (timer.cancelled) return;
  const delay = document.visibilityState === 'hidden' ? 30_000 : dynamicDelay();
  timer.timeoutId = nativeSetTimeout(async () => {
    if (timer.cancelled) return;
    if (document.visibilityState === 'visible') {
      try { await timer.callback(...timer.args); } catch {}
    }
    scheduleAdaptive(timer);
  }, delay);
}

window.setInterval = (callback, delay = 0, ...args) => {
  const numericDelay = Number(delay);
  if (![7500, 8000].includes(numericDelay) || typeof callback !== 'function') {
    return nativeSetInterval(callback, delay, ...args);
  }
  const id = `bardo-adaptive-${nextAdaptiveId++}`;
  const timer = { id, callback, args, timeoutId: null, cancelled: false };
  adaptiveTimers.set(id, timer);
  scheduleAdaptive(timer);
  return id;
};

window.clearInterval = (id) => {
  const timer = adaptiveTimers.get(id);
  if (!timer) return nativeClearInterval(id);
  timer.cancelled = true;
  nativeClearTimeout(timer.timeoutId);
  adaptiveTimers.delete(id);
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  markInteraction();
  for (const timer of adaptiveTimers.values()) {
    nativeClearTimeout(timer.timeoutId);
    timer.timeoutId = nativeSetTimeout(async () => {
      if (!timer.cancelled && document.visibilityState === 'visible') {
        try { await timer.callback(...timer.args); } catch {}
      }
      scheduleAdaptive(timer);
    }, 300);
  }
});

globalThis.__bardoAdaptivePolling = {
  cache: resourceCache,
  timers: adaptiveTimers,
  get failureStreak() { return failureStreak; },
  get nextDelayMs() { return dynamicDelay(); },
};
