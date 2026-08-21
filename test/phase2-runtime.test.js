import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from 'wrangler';
import {
  createNotificationDelivery,
  getNotificationPreference,
  setNotificationPreference,
} from '../src/repositories/notification-repository.js';

test('Phase 2 migration creates notification ledger, preferences and dedupe semantics in local D1', async () => {
  const server = createTestHarness({ workers: [{ configPath: './wrangler.jsonc' }] });
  await server.listen();
  try {
    const runtime = server.getWorker('bardo-discord');
    await runtime.applyD1Migrations('DB');
    const env = await runtime.getEnv();

    const prefTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notification_preferences'").first();
    const deliveryTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notification_deliveries'").first();
    assert.equal(prefTable?.name, 'notification_preferences');
    assert.equal(deliveryTable?.name, 'notification_deliveries');

    const guildId = '123456789012345678';
    const userId = '223456789012345678';
    const defaultPreference = await getNotificationPreference(env.DB, guildId, userId, 'task.assigned');
    assert.equal(defaultPreference.dmEnabled, true);

    const saved = await setNotificationPreference(env.DB, {
      guildId, userId, eventType: 'event.reminder', dmEnabled: false, reminderOffsetMinutes: 30,
    });
    assert.equal(saved.dmEnabled, false);
    assert.equal(saved.reminderOffsetMinutes, 30);

    const first = await createNotificationDelivery(env.DB, {
      dedupeKey: 'task.assigned:task-1:user-1:v1', guildId, userId,
      eventType: 'task.assigned', entityType: 'task', entityId: 'task-1',
    });
    const second = await createNotificationDelivery(env.DB, {
      dedupeKey: 'task.assigned:task-1:user-1:v1', guildId, userId,
      eventType: 'task.assigned', entityType: 'task', entityId: 'task-1',
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.delivery.id, first.delivery.id);
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM notification_deliveries WHERE dedupe_key = ?')
      .bind('task.assigned:task-1:user-1:v1').first();
    assert.equal(Number(count?.count), 1);
  } catch (error) {
    server.debug();
    throw error;
  } finally {
    await server.close();
  }
});
