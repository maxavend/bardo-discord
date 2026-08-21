import {
  claimNotificationDelivery,
  createNotificationDelivery,
  getNotificationPreference,
  listDueNotificationDeliveries,
  listNotificationPreferences,
  markNotificationFailed,
  markNotificationSent,
  markNotificationSkipped,
  setNotificationPreference,
} from '../repositories/notification-repository.js';
import { DiscordDmError, sendDiscordDm } from './discord-dm.js';
import { priorityLabel } from '../kanban.js';
import { emitStructuredLog } from '../lib/observability.js';

const DEFAULT_EVENT_REMINDER_OFFSETS = [1440, 60, 10];

function boardButton(boardId) {
  return [{ type: 1, components: [{ type: 2, style: 1, label: 'Abrir tarea', custom_id: `bardo:board:${boardId}` }] }];
}

function eventButton(eventId) {
  return [{ type: 1, components: [{ type: 2, style: 1, label: 'Abrir evento', custom_id: `bardo:event:${eventId}` }] }];
}

async function deliveryLog(env, delivery, deliveryStatus, errorCode = null) {
  if (!delivery) return;
  await emitStructuredLog('notification.delivery', {
    requestId: crypto.randomUUID(),
    entityType: delivery.entityType || 'notification',
    notificationType: delivery.eventType || 'unknown',
    deliveryStatus,
    errorCode,
  }, env, deliveryStatus === 'failed' ? 'warn' : 'log');
}

async function taskMessage(db, delivery) {
  const row = await db.prepare(`SELECT t.title, t.priority, t.board_id, b.name AS board_name
    FROM tasks t JOIN boards b ON b.id = t.board_id WHERE t.id = ?`).bind(delivery.entityId).first();
  if (!row) return null;
  const heading = delivery.eventType === 'task.reassigned' ? 'Te reasignaron una tarea en Bardo' :
    delivery.eventType === 'task.due_soon' ? 'Tienes una tarea urgente pendiente en Bardo' : 'Te asignaron una tarea en Bardo';
  const actor = delivery.actorUserId ? `\nAsignado por: <@${delivery.actorUserId}>` : '';
  return {
    content: `📋 **${heading}**\nTablero: **${row.board_name}**\nTarea: **${row.title}**\nPrioridad: **${priorityLabel(row.priority)}**${actor}`,
    components: boardButton(row.board_id),
  };
}

async function eventMessage(db, delivery) {
  const row = await db.prepare(`SELECT id, title, event_date, start_time, timezone, status, minute_document_id
    FROM events WHERE id = ?`).bind(delivery.entityId).first();
  if (!row) return null;
  const labels = {
    'event.invited': 'Te invitaron a un evento de Bardo',
    'event.updated': 'Un evento de Bardo cambió',
    'event.cancelled': 'Un evento de Bardo fue cancelado',
    'event.reminder': 'Recordatorio de evento de Bardo',
    'event.minutes_ready': 'La minuta de Bardo está lista',
  };
  const actor = delivery.actorUserId ? `\nActualizado por: <@${delivery.actorUserId}>` : '';
  return {
    content: `📅 **${labels[delivery.eventType] || 'Evento de Bardo'}**\n**${row.title}**\n${row.event_date} · ${row.start_time} · ${row.timezone || 'UTC'}${actor}`,
    components: eventButton(row.id),
  };
}

async function buildMessage(db, delivery) {
  if (delivery.entityType === 'task') return taskMessage(db, delivery);
  if (delivery.entityType === 'event') return eventMessage(db, delivery);
  return null;
}

export class NotificationService {
  constructor(env) {
    this.env = env;
    this.db = env.DB;
  }

  async getPreferences(guildId, userId) {
    return listNotificationPreferences(this.db, guildId, userId);
  }

  async setPreference(input) {
    return setNotificationPreference(this.db, input);
  }

  async enqueue(input, { waitUntil } = {}) {
    if (!input?.userId || !input?.guildId || !input?.entityId || !input?.eventType) return { created: false, skipped: true };
    const preference = await getNotificationPreference(this.db, input.guildId, input.userId, input.eventType);
    const created = await createNotificationDelivery(this.db, {
      ...input,
      dedupeKey: input.dedupeKey || `${input.eventType}:${input.entityType}:${input.entityId}:${input.userId}`,
    });
    if (!created.delivery) return created;
    if (!preference.dmEnabled) {
      if (created.created) {
        await markNotificationSkipped(this.db, created.delivery.id, 'PREFERENCE_DISABLED');
        await deliveryLog(this.env, created.delivery, 'skipped', 'PREFERENCE_DISABLED');
      }
      return { ...created, skipped: true };
    }

    if (created.created && Date.parse(created.delivery.scheduledFor) <= Date.now()) {
      const work = this.dispatch(created.delivery.id);
      if (typeof waitUntil === 'function') waitUntil(work);
      else await work;
    }
    return created;
  }

  async dispatch(deliveryId) {
    const delivery = await claimNotificationDelivery(this.db, deliveryId);
    if (!delivery) return { sent: false, claimed: false };
    try {
      const message = await buildMessage(this.db, delivery);
      if (!message) {
        await markNotificationSkipped(this.db, delivery.id, 'ENTITY_NOT_FOUND');
        await deliveryLog(this.env, delivery, 'skipped', 'ENTITY_NOT_FOUND');
        return { sent: false, skipped: true };
      }
      await sendDiscordDm(this.env, { userId: delivery.userId, ...message });
      await markNotificationSent(this.db, delivery.id);
      await deliveryLog(this.env, delivery, 'sent');
      return { sent: true };
    } catch (error) {
      if (error instanceof DiscordDmError && error.privacy) {
        await markNotificationSkipped(this.db, delivery.id, error.code);
        await deliveryLog(this.env, delivery, 'skipped', error.code);
        return { sent: false, skipped: true, code: error.code };
      }
      const code = error?.code || 'DELIVERY_FAILED';
      const delayMinutes = Math.min(30, Math.max(5, delivery.attempts * 5));
      const retryAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
      await markNotificationFailed(this.db, delivery.id, code, retryAt);
      await deliveryLog(this.env, delivery, 'failed', code);
      return { sent: false, failed: true, code };
    }
  }

  async processDue(limit = 50) {
    const due = await listDueNotificationDeliveries(this.db, new Date().toISOString(), limit);
    const results = [];
    for (const delivery of due) results.push(await this.dispatch(delivery.id));
    return results;
  }

  async reminderOffsetsFor(guildId, userId) {
    const preference = await getNotificationPreference(this.db, guildId, userId, 'event.reminder');
    if (!preference.dmEnabled) return [];
    if (preference.updatedAt && preference.reminderOffsetMinutes !== null) return [preference.reminderOffsetMinutes];
    return DEFAULT_EVENT_REMINDER_OFFSETS;
  }

  async enqueueEventReminders(now = new Date()) {
    const windowStart = new Date(now.getTime() - 7 * 60_000);
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60_000);
    const eventsResult = await this.db.prepare(`SELECT id, guild_id, starts_at FROM events
      WHERE status = 'scheduled' AND starts_at IS NOT NULL AND starts_at >= ? AND starts_at <= ?`)
      .bind(windowStart.toISOString(), windowEnd.toISOString()).all();
    let queued = 0;
    for (const event of eventsResult.results || []) {
      const starts = Date.parse(event.starts_at);
      const participants = await this.db.prepare('SELECT user_id FROM event_participants WHERE event_id = ?').bind(event.id).all();
      for (const person of participants.results || []) {
        const offsets = await this.reminderOffsetsFor(event.guild_id, person.user_id);
        for (const offset of offsets) {
          const trigger = starts - offset * 60_000;
          if (trigger > now.getTime() || trigger < windowStart.getTime()) continue;
          const result = await this.enqueue({
            guildId: event.guild_id, userId: person.user_id, eventType: 'event.reminder', entityType: 'event', entityId: event.id,
            dedupeKey: `event.reminder:${event.id}:${person.user_id}:${offset}`,
            scheduledFor: now.toISOString(),
          });
          if (result.created) queued += 1;
        }
      }
    }
    return queued;
  }

  async enqueueUrgentTaskReminders(now = new Date()) {
    const dateKey = now.toISOString().slice(0, 10);
    const result = await this.db.prepare(`SELECT t.id, t.assignee_id, b.guild_id
      FROM tasks t JOIN boards b ON b.id = t.board_id
      WHERE t.priority = 'urgent' AND COALESCE(t.column_id, t.status) != 'done' AND t.assignee_id IS NOT NULL`).all();
    let queued = 0;
    for (const row of result.results || []) {
      const created = await this.enqueue({
        guildId: row.guild_id, userId: row.assignee_id, eventType: 'task.due_soon', entityType: 'task', entityId: row.id,
        dedupeKey: `task.due_soon:${row.id}:${row.assignee_id}:${dateKey}`,
        scheduledFor: now.toISOString(),
      });
      if (created.created) queued += 1;
    }
    return queued;
  }
}
