import p2Worker from './p2-worker.js';
import { loadEventFull } from './event-db.js';
import { NotificationService } from './services/notifications.js';

function minutesEventId(pathname) {
  const match = pathname.match(/^\/api\/events\/([^/]+)\/minutes$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

async function enqueueMinutesReady(env, ctx, eventId, response) {
  if (!response.ok || !env?.DB) return;
  const payload = await response.clone().json().catch(() => null);
  const documentId = payload?.documentId || payload?.document?.id || null;
  if (!documentId) return;
  const event = await loadEventFull(env.DB, eventId);
  if (!event) return;
  const service = new NotificationService(env);
  for (const person of event.participants || []) {
    await service.enqueue({
      guildId: event.guildId,
      userId: person.userId,
      eventType: 'event.minutes_ready',
      entityType: 'event',
      entityId: event.id,
      dedupeKey: `event.minutes_ready:${event.id}:${person.userId}:${documentId}`,
    }, { waitUntil: typeof ctx?.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : undefined });
  }
}

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    const url = new URL(request.url);
    const eventId = request.method === 'POST' ? minutesEventId(url.pathname) : null;
    const response = await p2Worker.fetch(request, env, ctx);
    if (eventId && response.ok) {
      const work = enqueueMinutesReady(env, ctx, eventId, response).catch((error) => {
        console.error('[Bardo] No se pudieron programar las notificaciones de minuta:', error);
      });
      if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(work);
      else await work;
    }
    return response;
  },

  async scheduled(event, env, ctx = { waitUntil: () => {} }) {
    return p2Worker.scheduled(event, env, ctx);
  },
};
