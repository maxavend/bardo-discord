import { createEvent as createEventRecord, loadEventFull, updateEvent as updateEventRecord } from '../event-db.js';
import { replaceParticipantsAtomic } from '../event-integrity.js';
import { localDateTimeToInstant, parseClock, parseDuration, parseLocalDate, resolveTimezone } from '../lib/time.js';
import { NotificationService } from './notifications.js';

function uniquePeople(list = []) {
  const map = new Map();
  for (const person of list) {
    const userId = String(person?.userId || person?.id || '').trim();
    if (!userId) continue;
    map.set(userId, { userId, displayName: person.displayName || person.name || userId, avatarUrl: person.avatarUrl || null, role: person.role || 'participant' });
  }
  return [...map.values()];
}

export class EventService {
  constructor(env) {
    this.env = env;
    this.db = env.DB;
    this.notifications = new NotificationService(env);
  }

  normalizeInput(input = {}, current = null, context = {}) {
    const timezone = resolveTimezone({ eventTimezone: input.timezone || current?.timezone, userTimezone: context.userTimezone, guildTimezone: context.guildTimezone, fallback: 'UTC' });
    const eventDate = input.eventDate !== undefined ? parseLocalDate(input.eventDate, timezone).localDate : current?.eventDate;
    const clock = input.startTime !== undefined ? parseClock(input.startTime) : parseClock(current?.startTime || '00:00');
    const duration = input.expectedDuration !== undefined ? parseDuration(input.expectedDuration, { maxMinutes: 720 }).minutes : Number(current?.expectedDuration || 60);
    return { ...input, eventDate, startTime: clock.normalized, timezone, startsAt: localDateTimeToInstant(eventDate, clock, timezone), expectedDuration: duration };
  }

  async create(input, context = {}) {
    const normalized = this.normalizeInput(input, null, context);
    const participants = uniquePeople(input.participants || []);
    const event = await createEventRecord(this.db, {
      ...normalized,
      id: input.id || crypto.randomUUID(),
      guildId: input.guildId || context.guildId,
      createdBy: input.createdBy || context.actorUserId || 'unknown',
      participants: [],
    });
    if (participants.length) await replaceParticipantsAtomic(this.db, event.id, participants);
    const fullEvent = participants.length ? await loadEventFull(this.db, event.id) : event;
    for (const person of participants) {
      if (String(person.userId) === String(context.actorUserId || '')) continue;
      await this.notifications.enqueue({ guildId: event.guildId, userId: person.userId, eventType: 'event.invited', entityType: 'event', entityId: event.id, actorUserId: context.actorUserId || null, dedupeKey: `event.invited:${event.id}:${person.userId}` }, { waitUntil: context.waitUntil });
    }
    return fullEvent;
  }

  async update(eventId, fields, context = {}) {
    const before = await loadEventFull(this.db, eventId);
    if (!before) return null;
    if (context.guildId && String(context.guildId) !== String(before.guildId)) throw new Error('El evento pertenece a otro servidor.');
    const normalized = this.normalizeInput(fields, before, context);
    const safeFields = { ...normalized };
    delete safeFields.participants;
    const event = await updateEventRecord(this.db, eventId, safeFields);
    const type = safeFields.status === 'cancelled' && before.status !== 'cancelled' ? 'event.cancelled' : 'event.updated';
    for (const person of before.participants || []) {
      if (String(person.userId) === String(context.actorUserId || '')) continue;
      await this.notifications.enqueue({ guildId: before.guildId, userId: person.userId, eventType: type, entityType: 'event', entityId: eventId, actorUserId: context.actorUserId || null, dedupeKey: `${type}:${eventId}:${person.userId}:${event?.updatedAt || Date.now()}` }, { waitUntil: context.waitUntil });
    }
    return event;
  }

  async replaceParticipants(eventId, participants, context = {}) {
    const before = await loadEventFull(this.db, eventId);
    if (!before) throw new Error('Evento no encontrado.');
    if (context.guildId && String(context.guildId) !== String(before.guildId)) throw new Error('El evento pertenece a otro servidor.');
    const next = uniquePeople(participants);
    const previousIds = new Set((before.participants || []).map((person) => String(person.userId)));
    const saved = await replaceParticipantsAtomic(this.db, eventId, next);
    for (const person of next) {
      if (previousIds.has(String(person.userId)) || String(person.userId) === String(context.actorUserId || '')) continue;
      await this.notifications.enqueue({ guildId: before.guildId, userId: person.userId, eventType: 'event.invited', entityType: 'event', entityId: eventId, actorUserId: context.actorUserId || null, dedupeKey: `event.invited:${eventId}:${person.userId}` }, { waitUntil: context.waitUntil });
    }
    return saved;
  }
}
